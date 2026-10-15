"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, ExternalLink, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { LandingUtm, UtmImportResult } from "@/lib/course-landing-utms/model";

function UtmUrlButton({ item }: { item: LandingUtm }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  async function copyUrl() {
    setCopied(false); setError("");
    try { await navigator.clipboard.writeText(item.url); setCopied(true); }
    catch { setError("복사하지 못했습니다. 전체 URL을 선택해 직접 복사해 주세요."); }
  }
  return <Dialog onOpenChange={() => { setCopied(false); setError(""); }}>
    <DialogTrigger asChild><Button type="button" size="sm" variant="outline" aria-label={`${item.referral_code || item.channel} ${item.medium} URL 보기`}>URL 보기</Button></DialogTrigger>
    <DialogContent className="sm:max-w-xl" aria-describedby={undefined}>
      <DialogHeader><DialogTitle>랜딩페이지 URL</DialogTitle></DialogHeader>
      <p aria-label="전체 URL" className="max-h-[50dvh] overflow-y-auto rounded-md border bg-muted/40 p-3 break-all select-all">{item.url}</p>
      {copied && <p role="status" className="text-sm text-emerald-700">URL을 복사했습니다.</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <DialogFooter><Button type="button" onClick={() => void copyUrl()}><Copy />복사하기</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}

export function CourseLandingUtms({ courseId }: { courseId: string }) {
  const [items, setItems] = useState<LandingUtm[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [retry, setRetry] = useState(0);
  const [deleteItem, setDeleteItem] = useState<LandingUtm | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const endpoint = `/api/course-operations/${courseId}/landing-utms`;

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true); setError("");
      try {
        const response = await fetch(endpoint, { cache: "no-store", signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(body.message || "UTM을 불러오지 못했습니다.");
        if (!controller.signal.aborted) setItems(body.items);
      } catch (reason) {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "UTM을 불러오지 못했습니다.");
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, [endpoint, retry]);

  async function upload(file: File) {
    setSaving(true); setError(""); setNotice("");
    try {
      const form = new FormData(); form.set("file", file);
      const response = await fetch(endpoint, { method: "POST", body: form });
      const result: UtmImportResult & { message?: string } = await response.json();
      if (!response.ok) throw new Error(result.message || "UTM을 저장하지 못했습니다.");
      setNotice(`추가 ${result.added}건 · 업데이트 ${result.updated}건 · 변경 없음 ${result.unchanged}건을 반영했습니다.`);
      setRetry(value => value + 1);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "UTM을 저장하지 못했습니다."); }
    finally { setSaving(false); if (input.current) input.current.value = ""; }
  }

  async function copy(item: LandingUtm) {
    setError("");
    try { await navigator.clipboard.writeText(item.short_url); setNotice(`${item.referral_code || item.channel} · ${item.medium} 단축링크를 복사했습니다.`); }
    catch { setError("복사하지 못했습니다. 단축링크를 직접 선택해 복사해 주세요."); }
  }

  async function remove() {
    if (!deleteItem || deleting) return;
    setDeleting(true); setDeleteError("");
    try {
      const response = await fetch(endpoint, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: deleteItem.id }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "UTM을 삭제하지 못했습니다.");
      setItems(current => current.filter(item => item.id !== deleteItem.id));
      setNotice(`${deleteItem.referral_code || deleteItem.channel} · ${deleteItem.medium} UTM을 삭제했습니다.`);
      setError(""); setDeleteItem(null);
    } catch (reason) { setDeleteError(reason instanceof Error ? reason.message : "UTM을 삭제하지 못했습니다."); }
    finally { setDeleting(false); }
  }

  return <Card>
    <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
      <CardTitle>랜딩페이지 UTM</CardTitle>
      <Button type="button" variant="outline" disabled={loading || saving || deleting} onClick={() => input.current?.click()}><Upload />{saving ? "업데이트 중…" : "엑셀 업데이트"}</Button>
    </CardHeader>
    <CardContent className="space-y-4">
      <input ref={input} type="file" className="hidden" aria-label="UTM 엑셀 파일" accept=".xlsx" disabled={loading || saving || deleting} onChange={event => { const file = event.target.files?.[0]; if (file) void upload(file); }} />
      <p className="text-sm text-muted-foreground">첫 번째 시트의 유입 채널·추천 코드·진행 매체·URL·단축 링크 열을 읽습니다. 생성일은 저장하지 않습니다. 같은 채널·추천 코드·매체는 갱신하고 새 조합은 추가합니다. 파일에 없는 기존 항목은 유지됩니다. (.xlsx, 최대 4 MB·2,000행)</p>
      {notice && <p role="status" className="text-sm text-emerald-700">{notice}</p>}
      {error && <div className="flex flex-wrap items-center gap-3"><p role="alert" className="text-sm text-destructive">{error}</p><Button type="button" variant="outline" size="sm" disabled={loading || saving} onClick={() => setRetry(value => value + 1)}>목록 다시 불러오기</Button></div>}
      {loading ? <p role="status" className="py-4 text-sm text-muted-foreground">UTM을 불러오는 중…</p> : !items.length ? <p className="py-4 text-sm text-muted-foreground">등록된 UTM이 없습니다. 엑셀 업데이트로 항목을 추가해 주세요.</p> : <Table>
        <TableHeader><TableRow><TableHead>유입 채널</TableHead><TableHead>추천 코드</TableHead><TableHead>진행 매체</TableHead><TableHead>URL</TableHead><TableHead>단축 링크</TableHead><TableHead className="w-12"><span className="sr-only">삭제</span></TableHead></TableRow></TableHeader>
        <TableBody>{items.map(item => <TableRow key={item.id}>
          <TableCell className="whitespace-nowrap">{item.channel}</TableCell>
          <TableCell className="whitespace-nowrap">{item.referral_code || "—"}</TableCell>
          <TableCell className="whitespace-nowrap">{item.medium}</TableCell>
          <TableCell><UtmUrlButton item={item} /></TableCell>
          <TableCell>{item.short_url ? <div className="flex items-center gap-2 whitespace-nowrap"><span className="max-w-64 truncate text-sm" title={item.short_url}>{item.short_url}</span>
            <Button asChild size="icon-sm" variant="outline" className="shrink-0"><a href={item.short_url} target="_blank" rel="noopener noreferrer" title="단축링크 바로가기" aria-label={`${item.referral_code || item.channel} ${item.medium} 단축링크 바로가기`}><ExternalLink /></a></Button>
            <Button type="button" size="icon-sm" variant="outline" className="shrink-0" title="단축링크 복사하기" aria-label={`${item.referral_code || item.channel} ${item.medium} 단축링크 복사하기`} onClick={() => void copy(item)}><Copy /></Button>
          </div> : "—"}</TableCell>
          <TableCell className="text-right"><Button type="button" size="icon-sm" variant="ghost" className="text-muted-foreground hover:text-destructive" disabled={saving || deleting} title="UTM 삭제" aria-label={`${item.referral_code || item.channel} ${item.medium} UTM 삭제`} onClick={() => { setDeleteError(""); setDeleteItem(item); }}><Trash2 /></Button></TableCell>
        </TableRow>)}</TableBody>
      </Table>}
    </CardContent>
    <Dialog open={Boolean(deleteItem)} onOpenChange={open => { if (!open && !deleting) setDeleteItem(null); }}>
      <DialogContent showCloseButton={!deleting} aria-describedby={undefined}>
        <DialogHeader><DialogTitle>UTM 삭제</DialogTitle></DialogHeader>
        <p className="break-words">{deleteItem?.channel} · {deleteItem?.referral_code || "추천 코드 없음"} · {deleteItem?.medium} 항목을 삭제하시겠습니까?</p>
        {deleteError && <p role="alert" className="text-sm text-destructive">{deleteError}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={deleting} onClick={() => setDeleteItem(null)}>취소</Button>
          <Button type="button" variant="destructive" disabled={deleting} onClick={() => void remove()}>{deleting ? "삭제 중…" : "삭제"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </Card>;
}
