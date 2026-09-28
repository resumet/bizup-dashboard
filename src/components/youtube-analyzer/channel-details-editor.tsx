"use client";

import { useId, useState, type ChangeEvent, type FormEvent } from "react";
import { LoaderCircle, Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CHANNEL_CATEGORIES, type Analysis } from "@/lib/youtube-analyzer/model";

type ChannelDetails = Pick<Analysis, "email" | "category" | "appearance_fee" | "rs_percent" | "memo">;

function groupedDigits(value: string) {
  return value.replace(/\D/gu, "").replace(/\B(?=(\d{3})+(?!\d))/gu, ",");
}

export function ChannelDetailsEditor({ run, onSaved }: {
  run: Analysis;
  onSaved: (channelId: string, details: ChannelDetails) => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [category, setCategory] = useState("");
  const [fee, setFee] = useState("");
  const [rsPercent, setRsPercent] = useState("");
  const [memo, setMemo] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function openEditor(next: boolean) {
    if (saving) return;
    setOpen(next);
    if (next) {
      setEmail(run.email ?? "");
      setCategory(run.category ?? "");
      setFee(run.appearance_fee == null ? "" : groupedDigits(String(run.appearance_fee)));
      setRsPercent(run.rs_percent == null ? "" : String(run.rs_percent));
      setMemo(run.memo ?? "");
      setError("");
    }
  }

  function changeFee(event: ChangeEvent<HTMLInputElement>) {
    const element = event.currentTarget;
    const raw = element.value;
    const digitsBeforeCaret = raw.slice(0, element.selectionStart ?? raw.length).replace(/\D/gu, "").length;
    const formatted = groupedDigits(raw);
    setFee(formatted);
    let caret = 0;
    let digits = 0;
    while (caret < formatted.length && digits < digitsBeforeCaret) {
      if (/\d/u.test(formatted[caret])) digits++;
      caret++;
    }
    requestAnimationFrame(() => {
      if (document.activeElement === element) element.setSelectionRange(caret, caret);
    });
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const appearanceFee = fee ? Number(fee.replace(/,/gu, "")) : null;
    const revenueShare = rsPercent === "" ? null : Number(rsPercent);
    if (appearanceFee !== null && (!Number.isSafeInteger(appearanceFee) || appearanceFee < 0)) {
      setError("출연료는 0원 이상의 숫자로 입력해 주세요.");
      return;
    }
    if (revenueShare !== null && (!Number.isFinite(revenueShare) || revenueShare < 0 || revenueShare > 100)) {
      setError("RS는 0~100% 사이로 입력해 주세요.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const emailChanged = email.trim() !== (run.email ?? "");
      const response = await fetch("/api/youtube-channels", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId: run.channel_id, category: category || null, appearanceFee, rsPercent: revenueShare, memo, ...(emailChanged ? { email: email.trim() } : {}) }),
      });
      const result = await response.json() as ChannelDetails & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "채널 정보를 저장하지 못했습니다.");
      onSaved(run.channel_id, {
        email: emailChanged ? result.email : run.email,
        category: result.category,
        appearance_fee: result.appearance_fee,
        rs_percent: result.rs_percent,
        memo: result.memo,
      });
      setOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "채널 정보를 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return <Dialog open={open} onOpenChange={openEditor}>
    <DialogTrigger asChild><Button type="button" variant="outline" size="sm" aria-label={`${run.channel.name} 정보 수정`}><Pencil className="size-3.5" />정보 수정</Button></DialogTrigger>
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{run.channel.name} 채널 정보</DialogTitle>
        <DialogDescription>이메일 주소, 분류, 출연료와 RS 비율을 저장합니다.</DialogDescription>
      </DialogHeader>
      <form onSubmit={(event) => void save(event)} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor={`${id}-email`}>이메일 주소</Label>
          <Input id={`${id}-email`} type="email" autoComplete="email" maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" disabled={saving} />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${id}-category`}>분류</Label>
          <select id={`${id}-category`} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50" value={category} onChange={(event) => setCategory(event.target.value)} disabled={saving}>
            <option value="">분류 선택 안 함</option>
            {CHANNEL_CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${id}-fee`}>출연료</Label>
          <div className="relative"><Input id={`${id}-fee`} type="text" inputMode="numeric" autoComplete="off" value={fee} onChange={changeFee} placeholder="0" className="pr-9 text-right tabular-nums" disabled={saving} /><span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">원</span></div>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${id}-rs`}>RS(%)</Label>
          <div className="relative"><Input id={`${id}-rs`} type="number" inputMode="decimal" min="0" max="100" step="any" value={rsPercent} onChange={(event) => setRsPercent(event.target.value)} placeholder="0~100" className="pr-9 text-right tabular-nums" disabled={saving} /><span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span></div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3"><Label htmlFor={`${id}-memo`}>메모</Label><span className="text-xs text-muted-foreground">{memo.length} / 2,000</span></div>
          <Textarea id={`${id}-memo`} value={memo} onChange={(event) => setMemo(event.target.value)} maxLength={2000} rows={6} placeholder="채널 관련 메모를 입력하세요." disabled={saving} />
        </div>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <DialogClose asChild><Button type="button" variant="outline" disabled={saving}>취소</Button></DialogClose>
          <Button type="submit" disabled={saving}>{saving ? <LoaderCircle className="size-4 animate-spin" /> : null}저장</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
