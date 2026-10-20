"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, ExternalLink, Share2, Trash2, Upload, X } from "lucide-react";
import { createPortal } from "react-dom";
import { Toast } from "radix-ui";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { LandingUtm, UtmImportResult } from "@/lib/course-landing-utms/model";
import { formatLandingUtmShareContent } from "@/lib/course-landing-utms/share";

type Notify = (message: string, error?: boolean) => void;

function UtmShareButton({ items, instructorName, disabled, notify }: { items: LandingUtm[]; instructorName: string; disabled: boolean; notify: Notify }) {
  const content = formatLandingUtmShareContent(items, instructorName);
  async function copy() {
    try { await navigator.clipboard.writeText(content); notify("공유 내용을 복사했습니다."); }
    catch { notify("복사하지 못했습니다. 공유 내용을 직접 선택해 복사해 주세요.", true); }
  }
  return <Dialog>
    <DialogTrigger asChild><Button type="button" variant="outline" disabled={disabled}><Share2 />공유하기</Button></DialogTrigger>
    <DialogContent className="sm:max-w-xl" aria-describedby={undefined}>
      <DialogHeader><DialogTitle>UTM 공유하기</DialogTitle></DialogHeader>
      {items.length ? <>
        <p aria-label="UTM 공유 내용" className="max-h-[50dvh] overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted/40 p-3 break-all select-all">{content}</p>
      </> : <p className="text-sm text-muted-foreground">공유할 UTM이 없습니다. 엑셀 업데이트로 항목을 추가해 주세요.</p>}
      <DialogFooter><DialogClose asChild><Button type="button" variant="outline">닫기</Button></DialogClose><Button type="button" disabled={!items.length} onClick={() => void copy()}><Copy />복사하기</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}

function UtmUrlButton({ item, notify }: { item: LandingUtm; notify: Notify }) {
  async function copyUrl() {
    try { await navigator.clipboard.writeText(item.url); notify("URL을 복사했습니다."); }
    catch { notify("복사하지 못했습니다. 전체 URL을 선택해 직접 복사해 주세요.", true); }
  }
  return <Dialog>
    <DialogTrigger asChild><Button type="button" size="sm" variant="outline" aria-label={`${item.referral_code || item.channel} ${item.medium} URL 보기`}>URL 보기</Button></DialogTrigger>
    <DialogContent className="sm:max-w-xl" aria-describedby={undefined}>
      <DialogHeader><DialogTitle>랜딩페이지 URL</DialogTitle></DialogHeader>
      <p aria-label="전체 URL" className="max-h-[50dvh] overflow-y-auto rounded-md border bg-muted/40 p-3 break-all select-all">{item.url}</p>
      <DialogFooter><DialogClose asChild><Button type="button" variant="outline">닫기</Button></DialogClose><Button type="button" onClick={() => void copyUrl()}><Copy />복사하기</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}

export function CourseLandingUtms({ courseId, instructorName }: { courseId: string; instructorName: string }) {
  const [items, setItems] = useState<LandingUtm[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [toast, setToast] = useState<{ id: number; message: string; error: boolean } | null>(null);
  const toastId = useRef(0);
  const notify = useCallback<Notify>((message, error = false) => {
    setToast({ id: ++toastId.current, message, error });
  }, []);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [retry, setRetry] = useState(0);
  const [deleteItems, setDeleteItems] = useState<LandingUtm[]>([]);
  const [deleting, setDeleting] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const endpoint = `/api/course-operations/${courseId}/landing-utms`;

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true); setLoadFailed(false);
      try {
        const response = await fetch(endpoint, { cache: "no-store", signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(body.message || "UTM을 불러오지 못했습니다.");
        if (!controller.signal.aborted) {
          setItems(body.items);
          setSelected(current => new Set([...current].filter(id => body.items.some((item: LandingUtm) => item.id === id))));
        }
      } catch (reason) {
        if (!controller.signal.aborted) { setLoadFailed(true); notify(reason instanceof Error ? reason.message : "UTM을 불러오지 못했습니다.", true); }
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, [endpoint, retry, notify]);

  async function upload(file: File) {
    setSaving(true);
    try {
      const form = new FormData(); form.set("file", file);
      const response = await fetch(endpoint, { method: "POST", body: form });
      const result: UtmImportResult & { message?: string } = await response.json();
      if (!response.ok) throw new Error(result.message || "UTM을 저장하지 못했습니다.");
      notify(`추가 ${result.added}건 · 업데이트 ${result.updated}건 · 변경 없음 ${result.unchanged}건을 반영했습니다.`);
      setRetry(value => value + 1);
    } catch (reason) { notify(reason instanceof Error ? reason.message : "UTM을 저장하지 못했습니다.", true); }
    finally { setSaving(false); if (input.current) input.current.value = ""; }
  }

  async function copy(item: LandingUtm) {
    try { await navigator.clipboard.writeText(item.short_url); notify("단축링크를 복사했습니다."); }
    catch { notify("복사하지 못했습니다. 단축링크를 직접 선택해 복사해 주세요.", true); }
  }

  async function remove() {
    if (!deleteItems.length || deleting) return;
    setDeleting(true);
    let deletedCount = 0;
    try {
      // Keep each filtered DELETE request below gateway URL limits.
      for (let offset = 0; offset < deleteItems.length; offset += 100) {
        const ids = deleteItems.slice(offset, offset + 100).map(item => item.id);
        const response = await fetch(endpoint, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) });
        const body = await response.json();
        if (!response.ok) throw new Error(body.message || "UTM을 삭제하지 못했습니다.");
        deletedCount += body.deletedIds.length;
        const completed = new Set(ids);
        setItems(current => current.filter(item => !completed.has(item.id)));
        setSelected(current => new Set([...current].filter(id => !completed.has(id))));
        setDeleteItems(current => current.filter(item => !completed.has(item.id)));
      }
      notify(deletedCount ? `UTM ${deletedCount}건을 삭제했습니다.` : "이미 삭제된 항목입니다. 목록을 갱신했습니다.");
      setDeleteItems([]);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "UTM을 삭제하지 못했습니다.";
      notify(deletedCount ? `${deletedCount}건 삭제 완료. ${message} 남은 항목을 다시 시도해 주세요.` : message, true);
    } finally { setDeleting(false); }
  }

  const busy = loading || saving || deleting;
  return <Toast.Provider label="UTM 알림" duration={5000}><Card>
    <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
      <CardTitle>랜딩페이지 UTM</CardTitle>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" disabled={loading || saving || deleting} onClick={() => input.current?.click()}><Upload />{saving ? "업데이트 중…" : "엑셀 업데이트"}</Button>
        <UtmShareButton notify={notify} items={items} instructorName={instructorName} disabled={loading || saving || deleting} />
        <Button type="button" variant="outline" disabled={busy || !selected.size} onClick={() => setDeleteItems(items.filter(item => selected.has(item.id)))}><Trash2 />일괄 삭제{selected.size ? ` (${selected.size})` : ""}</Button>
      </div>
    </CardHeader>
    <CardContent className="space-y-4">
      <input ref={input} type="file" className="hidden" aria-label="UTM 엑셀 파일" accept=".xlsx" disabled={loading || saving || deleting} onChange={event => { const file = event.target.files?.[0]; if (file) void upload(file); }} />
      {loadFailed && <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => setRetry(value => value + 1)}>목록 다시 불러오기</Button>}
      {loading ? <p role="status" className="py-4 text-sm text-muted-foreground">UTM을 불러오는 중…</p> : loadFailed ? null : !items.length ? <p className="py-4 text-sm text-muted-foreground">등록된 UTM이 없습니다. 엑셀 업데이트로 항목을 추가해 주세요.</p> : <Table>
        <TableHeader><TableRow><TableHead className="w-12"><Checkbox aria-label="UTM 전체 선택" disabled={busy} checked={selected.size === items.length ? true : selected.size ? "indeterminate" : false} onCheckedChange={checked => setSelected(checked ? new Set(items.map(item => item.id)) : new Set())} /></TableHead><TableHead>유입 채널</TableHead><TableHead>추천 코드</TableHead><TableHead>진행 매체</TableHead><TableHead>URL</TableHead><TableHead>단축 링크</TableHead><TableHead className="w-12"><span className="sr-only">삭제</span></TableHead></TableRow></TableHeader>
        <TableBody>{items.map(item => <TableRow key={item.id} data-state={selected.has(item.id) ? "selected" : undefined}>
          <TableCell><Checkbox aria-label={`${item.referral_code || item.channel} ${item.medium} UTM 선택`} disabled={busy} checked={selected.has(item.id)} onCheckedChange={checked => setSelected(current => { const next = new Set(current); if (checked) next.add(item.id); else next.delete(item.id); return next; })} /></TableCell>
          <TableCell className="whitespace-nowrap">{item.channel}</TableCell>
          <TableCell className="whitespace-nowrap">{item.referral_code || "—"}</TableCell>
          <TableCell className="whitespace-nowrap">{item.medium}</TableCell>
          <TableCell><UtmUrlButton notify={notify} item={item} /></TableCell>
          <TableCell>{item.short_url ? <div className="flex items-center gap-2 whitespace-nowrap"><span className="max-w-64 truncate text-sm" title={item.short_url}>{item.short_url}</span>
            <Button asChild size="icon-sm" variant="outline" className="shrink-0"><a href={item.short_url} target="_blank" rel="noopener noreferrer" title="단축링크 바로가기" aria-label={`${item.referral_code || item.channel} ${item.medium} 단축링크 바로가기`}><ExternalLink /></a></Button>
            <Button type="button" size="icon-sm" variant="outline" className="shrink-0" title="단축링크 복사하기" aria-label={`${item.referral_code || item.channel} ${item.medium} 단축링크 복사하기`} onClick={() => void copy(item)}><Copy /></Button>
          </div> : "—"}</TableCell>
          <TableCell className="text-right"><Button type="button" size="icon-sm" variant="ghost" className="text-muted-foreground hover:text-destructive" disabled={saving || deleting} title="UTM 삭제" aria-label={`${item.referral_code || item.channel} ${item.medium} UTM 삭제`} onClick={() => setDeleteItems([item])}><Trash2 /></Button></TableCell>
        </TableRow>)}</TableBody>
      </Table>}
    </CardContent>
    <Dialog open={deleteItems.length > 0 || deleting} onOpenChange={open => { if (!open && !deleting) setDeleteItems([]); }}>
      <DialogContent showCloseButton={!deleting} aria-describedby={undefined}>
        <DialogHeader><DialogTitle>UTM 삭제</DialogTitle></DialogHeader>
        <p className="break-words">{deleteItems.length === 1 ? `${deleteItems[0].channel} · ${deleteItems[0].referral_code || "추천 코드 없음"} · ${deleteItems[0].medium} 항목` : `선택한 UTM ${deleteItems.length}건`}을 삭제하시겠습니까?</p>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={deleting} onClick={() => setDeleteItems([])}>취소</Button>
          <Button type="button" variant="destructive" disabled={deleting} onClick={() => void remove()}>{deleting ? "삭제 중…" : "삭제"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </Card>
    {toast && <>
      <Toast.Root key={toast.id} data-utm-toast="" duration={toast.error ? 8000 : 5000} onOpenChange={open => { if (!open) setToast(current => current?.id === toast.id ? null : current); }} className="flex items-center gap-3 rounded-xl border bg-popover p-4 text-popover-foreground shadow-lg">
        <Toast.Description className={`min-w-0 flex-1 break-words text-sm ${toast.error ? "text-destructive" : ""}`}>{toast.message}</Toast.Description>
        <Toast.Close asChild><Button type="button" size="icon-sm" variant="ghost" aria-label="알림 닫기"><X /></Button></Toast.Close>
      </Toast.Root>
      {createPortal(<Toast.Viewport label="UTM 알림" aria-live="off" className="pointer-events-auto fixed inset-x-4 bottom-4 z-[100] mx-auto flex max-w-xl list-none flex-col gap-2 outline-none" />, document.body)}
    </>}
  </Toast.Provider>;
}
