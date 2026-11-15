"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ArrowLeft, ChevronRight, Loader2, RefreshCw, Settings2 } from "lucide-react";
import { BackLink } from "@/components/layout/back-link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { groupCreativeRows, type CreativeData, type CreativeRow } from "@/lib/ad-creative/model";

const number = (value: number | null) => value === null ? "—" : value.toLocaleString("ko-KR", { maximumFractionDigits: 2 });

function Branch({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <details open={open} onToggle={event => setOpen(event.currentTarget.open)} className="rounded-lg border bg-background">
    <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
      <ChevronRight className={`size-4 shrink-0 transition-transform ${open ? "rotate-90" : ""}`} aria-hidden="true" />
      <span className="min-w-0 flex-1 break-words">{title}</span><span className="shrink-0 text-xs text-muted-foreground">{count.toLocaleString("ko-KR")}행</span>
    </summary>
    {open ? <div className="space-y-2 border-t p-3 sm:p-4">{children}</div> : null}
  </details>;
}

function AdTable({ rows }: { rows: CreativeRow[] }) {
  const [page, setPage] = useState(0);
  const google = rows[0]?.platform === "google";
  const headers = google ? ["광고 이름", "광고상태", "광고유형", "비용", "노출수", "클릭수", "전환", "웨비나네임"] : ["status", "adCost", "impression", "linkClick", "leads", "webinarName"];
  const pageCount = Math.ceil(rows.length / 100);
  return <>
    <Table><TableHeader><TableRow>{headers.map(header => <TableHead key={header}>{header}</TableHead>)}</TableRow></TableHeader>
      <TableBody>{rows.slice(page * 100, (page + 1) * 100).map((row, index) => <TableRow key={`${page}-${index}`}>
        {google ? <TableCell className="min-w-48 whitespace-normal break-words">{row.ad}</TableCell> : null}
        <TableCell>{row.status || "—"}</TableCell>{google ? <TableCell>{row.adType || "—"}</TableCell> : null}
        {[row.cost, row.impressions, row.clicks, row.conversions].map((value, column) => <TableCell key={column} className="text-right tabular-nums">{number(value)}</TableCell>)}
        <TableCell className="min-w-48 whitespace-normal">{row.webinar || "—"}</TableCell>
      </TableRow>)}</TableBody>
    </Table>
    {pageCount > 1 ? <div className="flex items-center justify-end gap-3"><Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>이전</Button><span className="text-sm">{page + 1} / {pageCount}</span><Button variant="outline" size="sm" disabled={page + 1 >= pageCount} onClick={() => setPage(page + 1)}>다음</Button></div> : null}
  </>;
}

const googleLevels = ["date", "campaign", "group"] as const;
const metaLevels = ["date", "campaign", "group", "ad"] as const;
function Hierarchy({ rows, depth = 0 }: { rows: CreativeRow[]; depth?: number }) {
  const levels = rows[0]?.platform === "google" ? googleLevels : metaLevels;
  if (depth === levels.length) return <AdTable rows={rows} />;
  return groupCreativeRows(rows, levels[depth]).map(([name, values]) => <Branch key={name} title={name} count={values.length}><Hierarchy rows={values} depth={depth + 1} /></Branch>);
}

export function CreativePerformance({ initialData }: { initialData: CreativeData }) {
  const [data, setData] = useState(initialData);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [url, setUrl] = useState(initialData.url);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialData.error ?? "");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const filtered = useMemo(() => data.rows.filter(row => (!from || row.date >= from) && (!to || row.date <= to) &&
    [row.instructor, row.webinar, row.campaign, row.group, row.ad].some(value => value.toLocaleLowerCase("ko-KR").includes(query.trim().toLocaleLowerCase("ko-KR")))), [data.rows, from, to, query]);
  const instructors = useMemo(() => groupCreativeRows(filtered, "instructor"), [filtered]);

  async function sync(nextUrl: string) {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/ad-creative", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: nextUrl, expectedUpdatedAt: data.updatedAt }) });
      const result = await response.json() as CreativeData & { message?: string };
      if (!response.ok) throw new Error(result.message || "데이터를 불러오지 못했습니다.");
      setData(result); setUrl(result.url); setSettingsOpen(false);
      setNotice(`${result.rows.length.toLocaleString("ko-KR")}행을 불러왔습니다.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "데이터를 불러오지 못했습니다."); }
    finally { setBusy(false); }
  }

  return <main className="mx-auto min-h-screen max-w-[1900px] space-y-6 px-5 py-8 lg:px-8">
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="ghost" size="icon-sm" asChild><BackLink href="/services/ad-performance"><ArrowLeft />뒤로가기</BackLink></Button>
      <h1 className="text-3xl font-semibold tracking-tight">소재성과 관리</h1>
      <div className="ml-auto flex gap-2">
        <Button variant="outline" disabled={busy || !data.url} onClick={() => void sync(data.url)}>{busy ? <Loader2 className="animate-spin" /> : <RefreshCw />}데이터 갱신</Button>
        <Button variant="outline" disabled={busy} onClick={() => { setUrl(data.url); setError(""); setSettingsOpen(true); }}><Settings2 />원본 데이터 설정</Button>
      </div>
    </div>
    {error && !settingsOpen ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    {notice ? <p role="status" className="text-sm text-emerald-700">{notice}</p> : null}
    {data.url ? <>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-60 flex-1 space-y-2"><Label htmlFor="creative-search">검색</Label><Input id="creative-search" placeholder="강사, 웨비나, 캠페인, 그룹, 광고명" value={query} onChange={event => setQuery(event.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="creative-from">시작일</Label><Input id="creative-from" type="date" value={from} max={to || undefined} onChange={event => setFrom(event.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="creative-to">종료일</Label><Input id="creative-to" type="date" value={to} min={from || undefined} onChange={event => setTo(event.target.value)} /></div>
        <Button variant="ghost" onClick={() => { setQuery(""); setFrom(""); setTo(""); }}>필터 초기화</Button>
      </div>
      <p className="text-xs text-muted-foreground">{filtered.length.toLocaleString("ko-KR")}행 · 마지막 갱신 {new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" }).format(new Date(data.updatedAt))}</p>
      {filtered.some(row => row.instructor === "강사 미분류") ? <p className="text-sm text-muted-foreground">강사 미분류 데이터는 원본 시트에 강사명 열을 입력하거나, webinarName을 ‘강사명웨비나’ 형식 또는 등록된 강의명과 동일하게 맞춰 주세요.</p> : null}
      <div key={`${data.updatedAt}:${query}:${from}:${to}`} className="space-y-3">
        {instructors.map(([instructor, rows]) => <Branch key={instructor} title={instructor} count={rows.length}>
          {(["google", "meta"] as const).map(platform => {
            const values = rows.filter(row => row.platform === platform);
            return <Branch key={platform} title={platform === "google" ? "Google 데이터" : "Meta 데이터"} count={values.length}>
              {values.length ? <Hierarchy rows={values} /> : <p className="text-sm text-muted-foreground">해당 매체 데이터가 없습니다.</p>}
            </Branch>;
          })}
        </Branch>)}
        {!instructors.length ? <p className="rounded-xl border p-10 text-center text-muted-foreground">{data.rows.length ? "검색 조건에 맞는 데이터가 없습니다." : "시트에 성과 데이터가 없습니다."}</p> : null}
      </div>
    </> : <div className="rounded-xl border p-10 text-center"><p className="mb-4 text-muted-foreground">google_raw와 meta_raw가 있는 Google 시트를 연결해 주세요.</p><Button onClick={() => setSettingsOpen(true)}>원본 데이터 설정</Button></div>}
    <Dialog open={settingsOpen} onOpenChange={open => { if (!busy) setSettingsOpen(open); }}>
      <DialogContent className="sm:max-w-xl" showCloseButton={!busy}>
        <form className="space-y-5" onSubmit={event => { event.preventDefault(); void sync(url); }}>
          <DialogHeader><DialogTitle>원본 데이터 설정</DialogTitle></DialogHeader>
          <div className="space-y-2"><Label htmlFor="creative-source">Google Sheets 링크</Label><Input id="creative-source" type="url" required value={url} disabled={busy} onChange={event => setUrl(event.target.value)} placeholder="https://docs.google.com/spreadsheets/d/.../edit" aria-describedby="creative-source-help" />
            <p id="creative-source-help" className="text-xs leading-5 text-muted-foreground">링크가 있는 모든 사용자에게 보기 권한을 허용해 주세요. google_raw와 meta_raw 시트의 첫 번째 데이터 행 위에 열 이름이 필요합니다. 강사명 열이 없으면 webinarName의 ‘강사명웨비나’ 형식 또는 등록된 강의명으로 강사를 분류합니다.</p>
          </div>
          <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">필수 열 확인</summary><p className="mt-2 leading-5">Google: 날짜, 캠페인, 광고그룹, 광고이름, 광고상태, 광고유형, 비용, 노출수, 클릭수, 전환, 웨비나네임<br />Meta: date, campaignName, adSetName, adName, status, adCost, impression, linkClick, leads, webinarName</p></details>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={() => setSettingsOpen(false)}>취소</Button><Button type="submit" disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : null}{busy ? "불러오는 중" : "저장하고 불러오기"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </main>;
}
