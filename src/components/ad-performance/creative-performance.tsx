"use client";
import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ArrowLeft, ChevronRight, Loader2, RefreshCw, Settings2 } from "lucide-react";
import { BackLink } from "@/components/layout/back-link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { aggregateCreativeRows, creativeStatusTone, creativeUnitCost, summarizeCreativeRows, groupCreativeRows, nextCreativeSort, sortCreativeRows, type CreativeData, type CreativeRow, type CreativeMetric, type CreativeSort } from "@/lib/ad-creative/model";
import { ToastNotice } from "@/components/ui/toast";

const number = (value: number | null) => value === null ? "—" : value.toLocaleString("ko-KR", { maximumFractionDigits: 2 });
function unitCost(cost: number | null, quantity: number | null) {
  const value = creativeUnitCost(cost, quantity);
  return value === null ? null : `${number(Math.round(value))}원/회`;
}
const statusColors = {
  green: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  amber: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200",
  red: "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200",
  blue: "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200",
  gray: "border-border bg-muted text-muted-foreground",
};

const hierarchyBackgrounds = {
  date: "bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/40 dark:hover:bg-sky-900/50",
  campaign: "bg-violet-50 hover:bg-violet-100 dark:bg-violet-950/40 dark:hover:bg-violet-900/50",
  group: "bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-900/50",
  ad: "hover:bg-muted/50",
};

function Branch({ title, count, children, totals, level }: { title: string; count: number; children: ReactNode; totals?: ReturnType<typeof summarizeCreativeRows>; level?: keyof typeof hierarchyBackgrounds }) {
  const [open, setOpen] = useState(false);
  return <details open={open} onToggle={event => setOpen(event.currentTarget.open)} className="rounded-lg border bg-background">
    <summary className={`flex cursor-pointer list-none flex-wrap items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden ${level ? hierarchyBackgrounds[level] : "hover:bg-muted/50"}`}>
      <ChevronRight className={`size-4 shrink-0 transition-transform ${open ? "rotate-90" : ""}`} aria-hidden="true" />
      <span className="min-w-0 flex-1 break-words">{title}</span><span className="shrink-0 text-xs text-muted-foreground">{count.toLocaleString("ko-KR")}행</span>
      {totals ? <span aria-label={`${title} 하위 데이터 전체 합계`} className="grid w-full grid-cols-2 gap-3 border-t pt-3 sm:grid-cols-4">
        {([
          ["cost", "비용 합계"], ["impressions", "노출수 합계"],
          ["clicks", "클릭수 합계"], ["conversions", "전환 합계"],
        ] as const).map(([key, label]) => <span key={key} className="min-w-0 space-y-1">
          <span className="block text-xs font-normal text-muted-foreground">{label}</span>
          <span className="block break-words font-semibold tabular-nums">{number(totals[key])}</span>
          {key !== "cost" && unitCost(totals.cost, totals[key]) ? <span className="block text-xs font-normal text-muted-foreground">({unitCost(totals.cost, totals[key])})</span> : null}
        </span>)}
      </span> : null}
    </summary>
    {open ? <div className="space-y-2 border-t p-3 sm:p-4">{children}</div> : null}
  </details>;
}

function AdTable({ rows, aggregated = false }: { rows: (CreativeRow & { statuses?: string[] })[]; aggregated?: boolean }) {
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<CreativeSort>(null);
  const sortedRows = useMemo(() => sortCreativeRows(rows, sort), [rows, sort]);
  const google = rows[0]?.platform === "google";
  const metricHeaders: Record<string, CreativeMetric> = { 비용: "cost", 노출수: "impressions", 클릭수: "clicks", 전환: "conversions", adCost: "cost", impression: "impressions", linkClick: "clicks", leads: "conversions" };
  const headers = google ? ["광고 이름", aggregated ? "최근 광고상태" : "광고상태", "광고유형", "비용", "노출수", "클릭수", "전환", "웨비나네임"] : [...(aggregated ? ["adName"] : []), aggregated ? "최근 status" : "status", "adCost", "impression", "linkClick", "leads", "webinarName"];
  const pageCount = Math.ceil(rows.length / 100);
  const totals = useMemo(() => summarizeCreativeRows(rows), [rows]);
  const totalLabels = google ? ["비용 합계", "노출수 합계", "클릭수 합계", "전환 합계"] : ["adCost 합계", "impression 합계", "linkClick 합계", "leads 합계"];
  return <>
    {!(google && aggregated) ? <dl aria-label="상세 성과 전체 행 합계" className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/30 p-4 xl:grid-cols-4">
      {(["cost", "impressions", "clicks", "conversions"] as const).map((key, index) => <div key={key} className="min-w-0 space-y-1">
        <dt className="text-xs text-muted-foreground">{totalLabels[index]}</dt>
        <dd className="break-words text-lg font-semibold tabular-nums">{number(totals[key])}</dd>
      </div>)}
    </dl> : null}
    <Table><TableHeader><TableRow>{headers.map(header => {
      const metric = aggregated ? metricHeaders[header] : undefined;
      const direction = metric && sort?.key === metric ? sort.direction : undefined;
      const SortIcon = direction === "descending" ? ArrowDown : direction === "ascending" ? ArrowUp : ArrowUpDown;
      return <TableHead key={header} aria-sort={metric ? direction ?? "none" : undefined}>
        {metric ? <button type="button" className="flex w-full items-center justify-end gap-1 rounded py-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          aria-label={`${header}: ${direction === "descending" ? "오름차순 정렬" : direction === "ascending" ? "정렬 해제" : "내림차순 정렬"}`}
          onClick={() => { setSort(current => nextCreativeSort(current, metric)); setPage(0); }}>
          {header}<SortIcon className="size-3.5" aria-hidden="true" />
        </button> : header}
      </TableHead>;
    })}</TableRow></TableHeader>
      <TableBody>{sortedRows.slice(page * 100, (page + 1) * 100).map((row, index) => <TableRow key={`${page}-${index}`}>
        {google || aggregated ? <TableCell className="min-w-48 whitespace-normal break-words">{row.ad}</TableCell> : null}
        <TableCell><span className="flex flex-wrap gap-1">{(row.statuses ?? [row.status]).map(status => <Badge key={status} variant="outline" className={statusColors[creativeStatusTone(status)]}>{status || "미입력"}</Badge>)}</span></TableCell>{google ? <TableCell>{row.adType || "—"}</TableCell> : null}
        {[row.cost, row.impressions, row.clicks, row.conversions].map((value, column) => <TableCell key={column} className="text-right tabular-nums">{number(value)}{column > 0 && unitCost(row.cost, value) ? <span className="ml-1 text-xs text-muted-foreground">({unitCost(row.cost, value)})</span> : null}</TableCell>)}
        <TableCell className="min-w-48 whitespace-normal">{row.webinar || "—"}</TableCell>
      </TableRow>)}</TableBody>
    </Table>
    {pageCount > 1 ? <div className="flex items-center justify-end gap-3"><Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>이전</Button><span className="text-sm">{page + 1} / {pageCount}</span><Button variant="outline" size="sm" disabled={page + 1 >= pageCount} onClick={() => setPage(page + 1)}>다음</Button></div> : null}
  </>;
}

const googleLevels = ["date", "campaign", "group"] as const;
function CreativeTable({ rows }: { rows: CreativeRow[] }) {
  const aggregated = useMemo(() => aggregateCreativeRows(rows), [rows]);
  return <AdTable rows={aggregated} aggregated />;
}

const metaLevels = ["date", "campaign", "group", "ad"] as const;
function Hierarchy({ rows, depth = 0 }: { rows: CreativeRow[]; depth?: number }) {
  const levels = rows[0]?.platform === "google" ? googleLevels : metaLevels;
  if (depth === levels.length) return <AdTable rows={rows} />;
  const prefix = levels[depth] === "campaign" ? "(campaign) " : levels[depth] === "group" ? "(group) " : "";
  return groupCreativeRows(rows, levels[depth]).map(([name, values]) => <Branch key={name} title={`${prefix}${name}`} count={values.length}
    level={levels[depth]}
    totals={levels[depth] === "ad" ? undefined : summarizeCreativeRows(values)}>
    <Hierarchy rows={values} depth={depth + 1} />
  </Branch>);
}

export function CreativePerformance({ initialData, initialInstructor = "", initialWebinar = "" }: { initialData: CreativeData; initialInstructor?: string; initialWebinar?: string }) {
  const [data, setData] = useState(initialData);
  const [filterSettingsOpen, setFilterSettingsOpen] = useState(false);
  const [webinarName, setWebinarName] = useState(initialData.webinarName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialData.error ?? "");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [view, setView] = useState<"date" | "creative">("date");
  const dateFilteredRows = useMemo(() => data.rows.filter(row => (!from || row.date >= from) && (!to || row.date <= to)), [data.rows, from, to]);
  const scopedRows = useMemo(() => {
    if (!initialInstructor && !initialWebinar) return dateFilteredRows;
    const matched = dateFilteredRows.filter(row => row.instructor === initialInstructor || row.webinar.includes(initialWebinar));
    return matched.length ? matched : dateFilteredRows;
  }, [dateFilteredRows, initialInstructor, initialWebinar]);
  const hasScopeFallback = Boolean((initialInstructor || initialWebinar) && dateFilteredRows.length && scopedRows.length === dateFilteredRows.length && !dateFilteredRows.some(row => row.instructor === initialInstructor || row.webinar.includes(initialWebinar)));
  const filtered = useMemo(() => scopedRows.filter(row =>
    [row.instructor, row.webinar, row.campaign, row.group, row.ad].some(value => value.toLocaleLowerCase("ko-KR").includes(query.trim().toLocaleLowerCase("ko-KR")))), [scopedRows, query]);
  const instructors = useMemo(() => groupCreativeRows(filtered, "instructor"), [filtered]);

  async function sync() {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/ad-creative", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: data.url, matchingKeywords: data.matchingKeywords, webinarName, expectedUpdatedAt: data.updatedAt }) });
      const result = await response.json() as CreativeData & { message?: string };
      if (!response.ok) throw new Error(result.message || "데이터를 불러오지 못했습니다.");
      setData(result); setWebinarName(result.webinarName); setFilterSettingsOpen(false);
      setNotice(`${result.rows.length.toLocaleString("ko-KR")}행을 불러왔습니다.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "데이터를 불러오지 못했습니다."); }
    finally { setBusy(false); }
  }

  return <main className="mx-auto min-h-screen max-w-[1900px] space-y-6 px-5 py-8 lg:px-8">
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="ghost" size="icon-sm" asChild><BackLink href="/services/ad-performance"><ArrowLeft />뒤로가기</BackLink></Button>
      <h1 className="text-3xl font-semibold tracking-tight">소재성과 관리</h1>
      <div className="ml-auto flex gap-2">
        <Button variant="outline" disabled={busy || !data.url} onClick={() => void sync()}>{busy ? <Loader2 className="animate-spin" /> : <RefreshCw />}데이터 갱신</Button>
        <Button variant="outline" disabled={busy || !data.url} onClick={() => { setWebinarName(data.webinarName); setError(""); setFilterSettingsOpen(true); }}><Settings2 />필터값 설정</Button>
      </div>
    </div>
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    <ToastNotice message={notice} onDismiss={() => setNotice("")} />
    {data.url ? <>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-60 flex-1 space-y-2"><Label htmlFor="creative-search">검색</Label><Input id="creative-search" placeholder="강사, 웨비나, 캠페인, 그룹, 광고명" value={query} onChange={event => setQuery(event.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="creative-from">시작일</Label><Input id="creative-from" type="date" value={from} max={to || undefined} onChange={event => setFrom(event.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="creative-to">종료일</Label><Input id="creative-to" type="date" value={to} min={from || undefined} onChange={event => setTo(event.target.value)} /></div>
        <Button variant="ghost" onClick={() => { setQuery(""); setFrom(""); setTo(""); }}>필터 초기화</Button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">{filtered.length.toLocaleString("ko-KR")}행 · 마지막 갱신 {new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" }).format(new Date(data.updatedAt))}</p>
        <div role="group" aria-label="성과 보기 방식" className="ml-auto flex gap-2">
          <Button variant={view === "date" ? "default" : "outline"} aria-pressed={view === "date"} onClick={() => setView("date")}>날짜별 보기</Button>
          <Button variant={view === "creative" ? "default" : "outline"} aria-pressed={view === "creative"} onClick={() => setView("creative")}>소재별 보기</Button>
        </div>
      </div>
      {hasScopeFallback ? <p className="text-sm text-muted-foreground">선택한 강의와 일치하는 소재 데이터가 없어, 저장된 전체 소재성과를 표시합니다.</p> : null}
      {filtered.some(row => row.instructor === "강사 미분류") ? <p className="text-sm text-muted-foreground">강사 미분류 데이터는 원본 시트에 강사명 열을 입력하거나, webinarName을 ‘강사명웨비나’ 형식 또는 등록된 강의명과 동일하게 맞춰 주세요.</p> : null}
      <div key={`${view}:${data.updatedAt}:${query}:${from}:${to}`} className="space-y-3">
        {instructors.map(([instructor, rows]) => <Branch key={instructor} title={instructor} count={rows.length}>
          {(["google", "meta"] as const).map(platform => {
            const values = rows.filter(row => row.platform === platform);
            return <Branch key={platform} title={platform === "google" ? "Google 데이터" : "Meta 데이터"} count={values.length}
              totals={summarizeCreativeRows(values)}>
              {values.length ? (view === "date" ? <Hierarchy rows={values} /> : <CreativeTable rows={values} />) : <p className="text-sm text-muted-foreground">해당 매체 데이터가 없습니다.</p>}
            </Branch>;
          })}
        </Branch>)}
        {!instructors.length ? <p className="rounded-xl border p-10 text-center text-muted-foreground">{data.rows.length ? "검색 조건에 맞는 데이터가 없습니다." : "시트에 성과 데이터가 없습니다."}</p> : null}
      </div>
    </> : <div className="rounded-xl border p-10 text-center"><p className="text-muted-foreground">내부광고 성과기록 화면에서 Google Sheets 주소를 설정해 주세요.</p></div>}
    <Dialog open={filterSettingsOpen} onOpenChange={(open) => { if (!busy) setFilterSettingsOpen(open); }}>
      <DialogContent className="sm:max-w-md" showCloseButton={!busy}>
        <form className="space-y-5" onSubmit={(event) => { event.preventDefault(); void sync(); }}>
          <DialogHeader><DialogTitle>필터값 설정</DialogTitle></DialogHeader>
          <div className="space-y-2"><Label htmlFor="creative-webinar-name">웨비나 이름</Label><Input id="creative-webinar-name" value={webinarName} disabled={busy} maxLength={300} onChange={(event) => setWebinarName(event.target.value)} placeholder="시트의 webinarName 값" />
            <p className="text-xs leading-5 text-muted-foreground">Google·Meta 시트의 webinarName 열과 완전히 같은 값의 행만 불러옵니다. 비우면 모든 웨비나 데이터를 사용합니다.</p>
          </div>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={() => setFilterSettingsOpen(false)}>취소</Button><Button type="submit" disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : null}{busy ? "불러오는 중" : "저장하고 불러오기"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </main>;
}
