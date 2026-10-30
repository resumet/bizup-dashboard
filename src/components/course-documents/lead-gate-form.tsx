"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LockKeyhole } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LeadGateForm({ slug }: { slug: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const query = new URLSearchParams(window.location.search);
      const response = await fetch(`/api/article/${encodeURIComponent(slug)}/lead`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          phone,
          utmSource: query.get("utm_source") ?? "",
          utmMedium: query.get("utm_medium") ?? "",
          utmCampaign: query.get("utm_campaign") ?? "",
          utmContent: query.get("utm_content") ?? "",
          referrer: document.referrer,
        }),
      });
      const body = await response.json() as { message?: string };
      if (!response.ok) throw new Error(body.message ?? "정보를 등록하지 못했습니다.");
      setOpen(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "정보를 등록하지 못했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="relative -mt-2 pb-4 pt-2" aria-label="잠긴 나머지 내용">
      <div className="pointer-events-none relative h-48 select-none overflow-hidden" aria-hidden="true">
        <div className="space-y-7 pt-5 opacity-35 blur-[1.5px] [mask-image:linear-gradient(to_bottom,black_5%,transparent_92%)]">
          <div className="space-y-3">
            <div className="h-3.5 w-[94%] rounded-full bg-foreground/35" />
            <div className="h-3.5 w-[86%] rounded-full bg-foreground/30" />
            <div className="h-3.5 w-[72%] rounded-full bg-foreground/25" />
          </div>
          <div className="space-y-3">
            <div className="h-3.5 w-[91%] rounded-full bg-foreground/25" />
            <div className="h-3.5 w-[78%] rounded-full bg-foreground/20" />
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-0 h-36 bg-gradient-to-b from-transparent via-[#faf9f7]/85 to-[#faf9f7]" />
      </div>
      <div className="relative -mt-20 flex justify-center">
        <Button
          type="button"
          size="lg"
          className="min-w-44 rounded-full px-8 shadow-[0_10px_30px_-12px_color-mix(in_oklab,var(--primary),transparent_45%)]"
          onClick={() => setOpen(true)}
        >
          더 보기
        </Button>
      </div>

      <Dialog open={open} onOpenChange={(nextOpen) => { if (!submitting) setOpen(nextOpen); }}>
        <DialogContent className="gap-6 p-6 sm:max-w-md sm:p-7">
          <DialogHeader className="gap-3 pr-7">
            <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary" aria-hidden="true">
              <LockKeyhole className="size-5" />
            </span>
            <DialogTitle className="text-xl font-semibold leading-tight">나머지 내용 확인</DialogTitle>
            <DialogDescription>이름과 전화번호를 저장하면 바로 이어서 읽을 수 있습니다.</DialogDescription>
          </DialogHeader>
          {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
          <form className="grid gap-5" onSubmit={submit}>
            <div className="space-y-2">
              <Label htmlFor="lead-name">이름</Label>
              <Input
                id="lead-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={80}
                autoComplete="name"
                disabled={submitting}
                autoFocus
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lead-phone">전화번호</Label>
              <Input
                id="lead-phone"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                inputMode="tel"
                autoComplete="tel"
                placeholder="010-0000-0000"
                disabled={submitting}
                required
              />
            </div>
            <Button className="mt-1 w-full" size="lg" disabled={submitting}>
              {submitting ? <Loader2 className="animate-spin" /> : null}
              {submitting ? "저장 중" : "저장"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
