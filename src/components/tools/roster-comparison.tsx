"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, Download, Loader2, RefreshCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { comparisonCsv } from "@/lib/roster-comparison/export";
import type { ComparisonContact, ComparisonKey, ComparisonPerson, ComparisonRoster, RosterComparisonResult } from "@/lib/roster-comparison/types";

const ENDPOINT = "/api/tools/roster-comparison";

async function body<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) throw new Error(data?.message ?? "요청을 처리하지 못했습니다. 다시 시도해 주세요.");
  return data as T;
}

export function RosterComparison() {
  const [file, setFile] = useState<File | null>(null);
  const [rosters, setRosters] = useState<ComparisonRoster[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [matchBy, setMatchBy] = useState<ComparisonKey>("phone");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<RosterComparisonResult | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(ENDPOINT, { cache: "no-store", signal: controller.signal }).then(body<{ rosters: ComparisonRoster[] }>).then((data) => {
      setRosters(data.rosters); setLoadError("");
      setSelected((current) => new Set([...current].filter((id) => data.rosters.some((roster) => roster.id === id))));
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) setLoadError(reason instanceof Error ? reason.message : "명단을 불러오지 못했습니다.");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [reload]);

  const visibleRosters = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase("ko-KR");
    return rosters.filter((roster) => `${roster.name} ${roster.courseName}`.toLocaleLowerCase("ko-KR").includes(keyword));
  }, [query, rosters]);
  const allVisibleSelected = visibleRosters.length > 0 && visibleRosters.every((roster) => selected.has(roster.id));

  function toggle(id: string, checked: boolean) {
    setSelected((current) => { const next = new Set(current); if (checked) next.add(id); else next.delete(id); return next; });
    setResult(null); setError("");
  }

  async function compare() {
    if (!file || !selected.size || busy) return;
    setBusy(true); setError(""); setResult(null);
    try {
      const form = new FormData(); form.set("file", file); form.set("rosterIds", JSON.stringify([...selected])); form.set("matchBy", matchBy);
      setResult(await body<RosterComparisonResult>(await fetch(ENDPOINT, { method: "POST", body: form })));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "명단을 비교하지 못했습니다."); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-6">
      <div>
        <Badge variant="outline" className="mb-3">간편 도구</Badge>
        <h1 className="text-3xl font-semibold tracking-tight">결제자·수강생 명단 비교</h1>
        <p className="mt-2 text-muted-foreground">결제자 엑셀과 저장된 수강생 명단들을 비교해, 양쪽에 각각 없는 사람을 확인합니다.</p>
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>1. 결제자 명단 엑셀</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Label htmlFor="payer-file">결제자 파일 (.xlsx, 최대 4MB)</Label>
            <Input id="payer-file" type="file" accept=".xlsx" disabled={busy} onChange={(event) => {
              const next = event.target.files?.[0] ?? null;
              setFile(next); setResult(null); setError("");
              if (next && (!/\.xlsx$/iu.test(next.name) || next.size > 4 * 1024 * 1024)) { setFile(null); setError("4MB 이하의 .xlsx 파일을 선택해 주세요."); }
            }} />
            <p className="text-sm text-muted-foreground">첫 번째 시트의 이름·전화번호·이메일 열을 자동으로 찾습니다. 회원명·고객명·휴대전화번호·연락처 등의 열 제목도 사용할 수 있습니다.</p>
            <div className="space-y-2">
              <Label htmlFor="comparison-key">동일인 비교 기준</Label>
              <select id="comparison-key" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={matchBy} disabled={busy} onChange={(event) => { setMatchBy(event.target.value as ComparisonKey); setResult(null); setError(""); }}>
                <option value="phone">전화번호</option><option value="email">이메일</option>
              </select>
            </div>
            <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">{matchBy === "phone" ? "전화번호의 하이픈·공백·국가번호(+82)를 정리한 뒤 비교합니다." : "이메일의 앞뒤 공백과 영문 대소문자를 정리한 뒤 비교합니다."} 같은 값은 한 사람으로 묶습니다. 이름만으로는 비교하지 않습니다.</p>
            <p className="text-xs text-muted-foreground">파일의 모든 데이터 행을 결제자로 취급합니다. 환불·취소 등 제외할 내역은 업로드 전에 정리해 주세요.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2"><CardTitle>2. 현재 수강생 명단 선택</CardTitle><Badge variant="secondary">{selected.size}개 선택</Badge></div>
            <p className="text-sm text-muted-foreground">분석 완료된 명단을 여러 개 선택하면 각 명단의 최신 저장본을 합쳐 비교합니다.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2"><Input aria-label="수강생 명단 검색" placeholder="명단명·강의명 검색" value={query} onChange={(event) => setQuery(event.target.value)} /><Button type="button" variant="outline" size="icon" aria-label="수강생 명단 새로고침" disabled={loading || busy} onClick={() => { setLoading(true); setResult(null); setReload((value) => value + 1); }}><RefreshCw className={loading ? "animate-spin" : ""} /></Button></div>
            {loading ? <p role="status" className="py-8 text-center text-sm text-muted-foreground">명단을 불러오는 중입니다.</p> : loadError ? <p role="alert" className="text-sm text-destructive">{loadError}</p> : (
              <>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" disabled={busy || !visibleRosters.length} onClick={() => {
                    setSelected((current) => { const next = new Set(current); for (const roster of visibleRosters) { if (allVisibleSelected) next.delete(roster.id); else next.add(roster.id); } return next; }); setResult(null);
                  }}>{allVisibleSelected ? "검색 결과 선택 해제" : "검색 결과 전체 선택"}</Button>
                  <Button type="button" size="sm" variant="ghost" disabled={busy || !selected.size} onClick={() => { setSelected(new Set()); setResult(null); }}>모두 해제</Button>
                </div>
                <div className="max-h-80 space-y-2 overflow-y-auto">
                  {visibleRosters.map((roster) => <label key={roster.id} className="flex cursor-pointer items-start gap-3 rounded-md border p-3">
                    <Checkbox className="mt-1" checked={selected.has(roster.id)} disabled={busy} onCheckedChange={(checked) => toggle(roster.id, checked === true)} />
                    <span className="min-w-0 flex-1"><span className="block break-words text-sm font-medium">{roster.name}</span><span className="mt-1 block text-xs text-muted-foreground">{roster.courseName || "강의명 미입력"} · {roster.count.toLocaleString("ko-KR")}행</span></span>
                  </label>)}
                  {!visibleRosters.length ? <p className="py-8 text-center text-sm text-muted-foreground">{rosters.length ? "검색 조건에 맞는 명단이 없습니다." : <>비교할 명단이 없습니다. <Link className="underline" href="/services/course-roster">수강생 명단</Link>을 먼저 등록해 주세요.</>}</p> : null}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
      {error ? <Alert variant="destructive"><AlertTitle>비교할 수 없습니다.</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">선택한 명단 최대 100개 · 수강생 최대 100,000행</p>
        <Button type="button" disabled={!file || !selected.size || selected.size > 100 || busy || loading || Boolean(loadError)} onClick={() => void compare()}>{busy ? <Loader2 className="animate-spin" /> : <ArrowLeftRight />}{busy ? "명단 비교 중" : "명단 비교하기"}</Button>
      </div>
      {selected.size > 100 ? <p role="alert" className="text-sm text-destructive">명단은 한 번에 100개까지 선택할 수 있습니다.</p> : null}
      {result ? <section className="space-y-5" aria-label="명단 비교 결과">
        <div className="grid gap-3 sm:grid-cols-3">
          {[["결제자", result.payerCount], ["수강생", result.studentCount], ["양쪽에 모두 있음", result.matchedCount]].map(([label, count]) => <Card key={label}><CardContent><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold">{Number(count).toLocaleString("ko-KR")}명</p></CardContent></Card>)}
        </div>
        <p className="text-sm text-muted-foreground">{result.matchBy === "phone" ? "전화번호" : "이메일"} 기준 · 결제자 원본 {result.payerRows.toLocaleString("ko-KR")}행 / 수강생 원본 {result.studentRows.toLocaleString("ko-KR")}행 · 중복행 통합 {result.payerDuplicateRows.toLocaleString("ko-KR")}행 / {result.studentDuplicateRows.toLocaleString("ko-KR")}행</p>
        {result.invalidPayers.length + result.invalidStudents.length > 0 ? <Alert><AlertTitle>비교 기준 값을 확인할 행이 있습니다.</AlertTitle><AlertDescription>결제자 {result.invalidPayers.length}행, 수강생 {result.invalidStudents.length}행은 값이 없거나 올바르지 않아 인원 비교에서 제외했습니다. 상대 명단의 누락 결과에도 영향을 줄 수 있으므로 아래 확인 필요 목록을 함께 검토해 주세요.</AlertDescription></Alert> : null}
        <div className="grid items-start gap-5 xl:grid-cols-2">
          <ComparisonResults title="결제자에만 있는 사람" description="결제자에는 있지만 선택한 수강생 명단에는 없는 사람" people={result.payerOnly} filename="결제자만-수강생명단누락.csv" />
          <ComparisonResults title="수강생에만 있는 사람" description="선택한 수강생 명단에는 있지만 결제자에는 없는 사람" people={result.studentOnly} filename="수강생만-결제자명단누락.csv" />
        </div>
        <InvalidContacts title="결제자 확인 필요" contacts={result.invalidPayers} />
        <InvalidContacts title="수강생 확인 필요" contacts={result.invalidStudents} />
      </section> : null}
    </div>
  );
}

function ComparisonResults({ title, description, people, filename }: { title: string; description: string; people: ComparisonPerson[]; filename: string }) {
  const [page, setPage] = useState(1);
  const [downloadError, setDownloadError] = useState("");
  const pages = Math.max(1, Math.ceil(people.length / 50));
  const current = Math.min(page, pages);
  function download() {
    setDownloadError("");
    try {
      const url = URL.createObjectURL(new Blob([comparisonCsv(people)], { type: "text/csv;charset=utf-8" }));
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; document.body.appendChild(anchor);
      try { anchor.click(); } finally { anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
    } catch { setDownloadError("CSV를 생성하지 못했습니다. 다시 시도해 주세요."); }
  }
  return <Card className="min-w-0 overflow-hidden">
    <CardHeader><div className="flex flex-wrap items-center justify-between gap-2"><CardTitle>{title} · {people.length.toLocaleString("ko-KR")}명</CardTitle><Button type="button" size="sm" variant="outline" disabled={!people.length} onClick={download} aria-label={`${title} CSV 다운로드`}><Download />CSV</Button></div><p className="text-sm text-muted-foreground">{description}</p></CardHeader>
    <CardContent>
      {downloadError ? <p role="alert" className="mb-2 text-sm text-destructive">{downloadError}</p> : null}
      {people.length ? <Table><TableHeader><TableRow><TableHead>이름</TableHead><TableHead>전화번호</TableHead><TableHead>이메일</TableHead><TableHead>출처 명단</TableHead></TableRow></TableHeader><TableBody>{people.slice((current - 1) * 50, current * 50).map((person, index) => <TableRow key={index}><TableCell>{person.name || "이름 없음"}</TableCell><TableCell>{person.phone || "-"}</TableCell><TableCell>{person.email || "-"}</TableCell><TableCell className="min-w-40 whitespace-normal">{person.sources.join(" / ")}</TableCell></TableRow>)}</TableBody></Table> : <p className="py-8 text-center text-sm text-muted-foreground">해당하는 사람이 없습니다.</p>}
      {pages > 1 ? <div className="mt-3 flex items-center justify-between text-sm"><span>{current} / {pages}페이지</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={current === 1} onClick={() => setPage(current - 1)}>이전</Button><Button size="sm" variant="outline" disabled={current === pages} onClick={() => setPage(current + 1)}>다음</Button></div></div> : null}
    </CardContent>
  </Card>;
}

function InvalidContacts({ title, contacts }: { title: string; contacts: ComparisonContact[] }) {
  const [page, setPage] = useState(1);
  if (!contacts.length) return null;
  const pages = Math.ceil(contacts.length / 50);
  const current = Math.min(page, pages);
  return <details className="rounded-lg border bg-card p-4"><summary className="cursor-pointer font-medium">{title} · {contacts.length.toLocaleString("ko-KR")}행</summary><div className="mt-3 max-h-80 overflow-auto"><Table><TableHeader><TableRow><TableHead>이름</TableHead><TableHead>전화번호</TableHead><TableHead>이메일</TableHead><TableHead>출처</TableHead><TableHead>원본 행</TableHead></TableRow></TableHeader><TableBody>{contacts.slice((current - 1) * 50, current * 50).map((contact, index) => <TableRow key={index}><TableCell>{contact.name || "-"}</TableCell><TableCell>{contact.phone || "-"}</TableCell><TableCell>{contact.email || "-"}</TableCell><TableCell>{contact.source}</TableCell><TableCell>{contact.rowNumber}</TableCell></TableRow>)}</TableBody></Table></div>{pages > 1 ? <div className="mt-3 flex items-center justify-between text-sm"><span>{current} / {pages}페이지</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={current === 1} onClick={() => setPage(current - 1)}>이전</Button><Button size="sm" variant="outline" disabled={current === pages} onClick={() => setPage(current + 1)}>다음</Button></div></div> : null}</details>;
}
