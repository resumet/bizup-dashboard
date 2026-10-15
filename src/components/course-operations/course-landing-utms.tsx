"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, ExternalLink, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { LandingUtm, UtmImportResult } from "@/lib/course-landing-utms/model";

export function CourseLandingUtms({ courseId }: { courseId: string }) {
  const [items, setItems] = useState<LandingUtm[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [retry, setRetry] = useState(0);
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

  return <Card>
    <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
      <CardTitle>랜딩페이지 UTM</CardTitle>
      <Button type="button" variant="outline" disabled={loading || saving} onClick={() => input.current?.click()}><Upload />{saving ? "업데이트 중…" : "엑셀 업데이트"}</Button>
    </CardHeader>
    <CardContent className="space-y-4">
      <input ref={input} type="file" className="hidden" aria-label="UTM 엑셀 파일" accept=".xlsx" disabled={loading || saving} onChange={event => { const file = event.target.files?.[0]; if (file) void upload(file); }} />
      <p className="text-sm text-muted-foreground">첫 번째 시트의 유입 채널·추천 코드·진행 매체·URL·단축 링크 열을 읽습니다. 생성일은 저장하지 않습니다. 같은 채널·추천 코드·매체는 갱신하고 새 조합은 추가합니다. 파일에 없는 기존 항목은 유지됩니다. (.xlsx, 최대 4 MB·2,000행)</p>
      {notice && <p role="status" className="text-sm text-emerald-700">{notice}</p>}
      {error && <div className="flex flex-wrap items-center gap-3"><p role="alert" className="text-sm text-destructive">{error}</p><Button type="button" variant="outline" size="sm" disabled={loading || saving} onClick={() => setRetry(value => value + 1)}>목록 다시 불러오기</Button></div>}
      {loading ? <p role="status" className="py-4 text-sm text-muted-foreground">UTM을 불러오는 중…</p> : !items.length ? <p className="py-4 text-sm text-muted-foreground">등록된 UTM이 없습니다. 엑셀 업데이트로 항목을 추가해 주세요.</p> : <Table>
        <TableHeader><TableRow><TableHead>유입 채널</TableHead><TableHead>추천 코드</TableHead><TableHead>진행 매체</TableHead><TableHead>URL</TableHead><TableHead>단축 링크</TableHead></TableRow></TableHeader>
        <TableBody>{items.map(item => <TableRow key={item.id}>
          <TableCell className="whitespace-nowrap">{item.channel}</TableCell>
          <TableCell className="whitespace-nowrap">{item.referral_code || "—"}</TableCell>
          <TableCell className="whitespace-nowrap">{item.medium}</TableCell>
          <TableCell className="whitespace-normal"><a href={item.url} target="_blank" rel="noopener noreferrer" className="block min-w-48 max-w-sm break-all text-sm underline underline-offset-4">{item.url}</a></TableCell>
          <TableCell className="whitespace-normal">{item.short_url ? <div className="min-w-48 max-w-64 space-y-2"><span className="block break-all text-sm">{item.short_url}</span><div className="flex gap-2">
            <Button asChild size="sm" variant="outline"><a href={item.short_url} target="_blank" rel="noopener noreferrer" aria-label={`${item.referral_code || item.channel} ${item.medium} 단축링크 바로가기`}><ExternalLink />바로가기</a></Button>
            <Button type="button" size="sm" variant="outline" aria-label={`${item.referral_code || item.channel} ${item.medium} 단축링크 복사하기`} onClick={() => void copy(item)}><Copy />복사하기</Button>
          </div></div> : "—"}</TableCell>
        </TableRow>)}</TableBody>
      </Table>}
    </CardContent>
  </Card>;
}
