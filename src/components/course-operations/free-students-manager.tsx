"use client";

import { useMemo, useState } from "react";
import { Loader2, Download, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { applicantColumns, applicantValue, filterApplicants, type FreeStudentsSnapshot } from "@/lib/free-students/model";
import { freeStudentsPhoneSalesCsv } from "@/lib/free-students/phone-sales";

export function FreeStudentsManager({ courseId, landingPageLink, initialSnapshot }: { courseId: string; landingPageLink: string; initialSnapshot: FreeStudentsSnapshot | null }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const rows = useMemo(() => filterApplicants(snapshot?.rows ?? [], query), [snapshot, query]);
  async function importStudents() {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/course-operations/${courseId}/free-students`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "명단을 가져오지 못했습니다.");
      setSnapshot(data); setPage(0); setNotice(`${data.rows.length.toLocaleString("ko-KR")}명의 명단을 저장했습니다.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "명단을 가져오지 못했습니다."); }
    finally { setBusy(false); }
  }
  function downloadPhoneSalesList() {
    const { contacts, csv } = freeStudentsPhoneSalesCsv(snapshot?.rows ?? []);
    if (!contacts.length) {
      setError("유효한 국내 휴대전화 번호가 있는 무료 수강생이 없습니다.");
      return;
    }
    setError(""); setNotice(`${contacts.length.toLocaleString("ko-KR")}명의 전화세일즈 명단을 다운로드했습니다.`);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "무료수강생_전화세일즈명단.csv";
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  return <section className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="w-full space-y-2 sm:max-w-sm"><Label htmlFor="free-student-search">명단 검색</Label><Input id="free-student-search" placeholder="이름, 연락처, 유입경로 등 모든 항목 검색" value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} /></div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={busy || !snapshot?.rows.length} onClick={downloadPhoneSalesList}><FileSpreadsheet />전화세일즈 목록 만들기</Button>
        <Button disabled={busy || !landingPageLink} onClick={() => void importStudents()}>{busy ? <Loader2 className="animate-spin" /> : <Download />}{busy ? "명단 가져오는 중" : "명단 가져오기"}</Button>
      </div>
    </div>
    {!landingPageLink ? <p className="text-sm text-muted-foreground">강의 상세에서 무료 랜딩페이지 링크를 저장해 주세요.</p> : null}
    {snapshot && snapshot.source_url !== landingPageLink ? <p role="status" className="text-sm text-amber-700">저장된 명단과 현재 강의 링크가 다릅니다. 명단 가져오기로 갱신해 주세요.</p> : null}
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    {notice ? <p role="status" className="text-sm text-emerald-700">{notice}</p> : null}
    <div className="flex flex-wrap justify-between gap-2 text-sm text-muted-foreground"><span>전체 {(snapshot?.rows.length ?? 0).toLocaleString("ko-KR")}명 · 검색 {rows.length.toLocaleString("ko-KR")}명</span>{snapshot ? <span>최근 가져오기 {applicantValue("appliedAt", snapshot.updated_at)}</span> : null}</div>
    <div className="rounded-lg border"><Table><TableHeader><TableRow>{applicantColumns.map(([key, label]) => <TableHead key={key}>{label}</TableHead>)}</TableRow></TableHeader>
      <TableBody>{rows.slice(page * 100, (page + 1) * 100).map((row, index) => <TableRow key={`${page}-${index}`}>{applicantColumns.map(([key]) => <TableCell key={key} className={key === "title" || key === "firstInflowFreeCourseTitle" ? "min-w-64 max-w-96 whitespace-normal break-words" : "whitespace-nowrap"}>{applicantValue(key, row[key])}</TableCell>)}</TableRow>)}
        {!rows.length ? <TableRow><TableCell colSpan={applicantColumns.length} className="h-28 text-center text-muted-foreground">{query ? "검색 결과가 없습니다." : snapshot ? "신청자가 없습니다." : "명단 가져오기를 눌러 무료수강생을 불러와 주세요."}</TableCell></TableRow> : null}
      </TableBody></Table></div>
    {rows.length > 100 ? <div className="flex items-center justify-end gap-3"><Button variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>이전</Button><span>{page + 1} / {Math.ceil(rows.length / 100)}</span><Button variant="outline" disabled={(page + 1) * 100 >= rows.length} onClick={() => setPage(page + 1)}>다음</Button></div> : null}
  </section>;
}
