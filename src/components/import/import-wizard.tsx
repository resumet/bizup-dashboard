"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, FileSpreadsheet, Loader2, ShieldCheck, Upload, X } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ImportPreview } from "@/lib/import/contract";

export function ImportWizard() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [jobName, setJobName] = useState("");
  const [courseName, setCourseName] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [phoneErrorDialogOpen, setPhoneErrorDialogOpen] = useState(false);

  async function previewFile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    setLoading(true); setError(""); setPreview(null);
    try {
      const body = new FormData(); body.set("file", file);
      const response = await fetch("/api/imports/preview", { method: "POST", body });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "파일을 분석하지 못했습니다.");
      setPreview(data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "파일을 분석하지 못했습니다.");
    } finally { setLoading(false); }
  }

  async function saveImport(excludeInvalidPhoneRows = false) {
    if (!file) return;
    setSaving(true); setError("");
    try {
      const body = new FormData();
      body.set("file", file); body.set("jobName", jobName); body.set("courseName", courseName);
      body.set("excludeInvalidPhoneRows", String(excludeInvalidPhoneRows));
      const response = await fetch("/api/imports/commit", { method: "POST", body });
      const data = await response.json();
      if (response.status === 401) { router.push("/login"); return; }
      if (!response.ok) throw new Error(data.message ?? "명단을 저장하지 못했습니다.");
      router.push("/services/course-roster"); router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "명단을 저장하지 못했습니다.");
    } finally { setSaving(false); }
  }

  function resetImport() {
    setPhoneErrorDialogOpen(false);
    setPreview(null);
    setFile(null);
    setError("");
  }

  function requestSave() {
    if (!preview) return;
    if (preview.summary.errorRows > 0) {
      setPhoneErrorDialogOpen(true);
      return;
    }
    void saveImport();
  }

  return <>
    <Badge variant="outline" className="mb-3">{preview ? "2 / 4 단계" : "1 / 4 단계"}</Badge>
    <h1 className="text-3xl font-semibold tracking-tight">{preview ? "컬럼 매핑과 검증 결과" : "새 명단 가져오기"}</h1>
    <p className="mt-2 text-muted-foreground">{preview ? "자동 매핑 결과와 오류를 확인한 뒤 저장하세요." : "작업 정보를 입력하고 분석할 CSV 파일을 선택하세요."}</p>
    {error && <Alert variant="destructive" className="mt-6"><AlertCircle /><AlertTitle>처리할 수 없습니다</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}

    {!preview ? <form onSubmit={previewFile} className="mt-8 grid gap-6 md:grid-cols-[1fr_280px]">
      <Card><CardHeader><CardTitle>작업 정보</CardTitle><CardDescription>샘플과 같은 UTF-8 CSV 또는 XLSX 형식을 지원합니다.</CardDescription></CardHeader><CardContent className="space-y-6">
        <div className="space-y-2"><Label htmlFor="job-name">작업명 <span className="text-muted-foreground">(선택)</span></Label><Input id="job-name" value={jobName} onChange={(event) => setJobName(event.target.value)} placeholder="비워두면 파일명을 사용합니다" /></div>
        <div className="space-y-2"><Label htmlFor="course-name">기본 강의명</Label><Input id="course-name" value={courseName} onChange={(event) => setCourseName(event.target.value)} placeholder="CSV에 강의명 컬럼이 없을 때 사용합니다" /></div>
        <div className="space-y-3"><Label>명단 파일</Label><label htmlFor="roster-file" className="flex min-h-48 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed bg-muted/35 p-6 text-center transition-colors hover:bg-muted/60"><span className="mb-4 grid size-11 place-items-center rounded-full bg-background shadow-sm"><Upload className="size-5 text-primary" /></span>{file ? <><span className="font-medium">{file.name}</span><span className="mt-2 text-sm text-muted-foreground">{(file.size / 1024).toFixed(1)}KB</span></> : <><span className="font-medium">파일을 선택하세요</span><span className="mt-2 text-sm text-muted-foreground">UTF-8 CSV 또는 XLSX · 최대 20MB</span></>}<input id="roster-file" type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setError(""); }} /></label></div>
        <div className="flex justify-end"><Button type="submit" disabled={!file || loading}>{loading ? <><Loader2 className="animate-spin" />분석 중</> : "파일 분석하기"}</Button></div>
      </CardContent></Card>
      <div className="space-y-4"><Alert><ShieldCheck /><AlertTitle>서버에서 안전하게 검증</AlertTitle><AlertDescription>저장 전에 파일 구조와 전화번호 누락 여부를 확인할 수 있는 미리보기를 생성합니다.</AlertDescription></Alert><Card><CardHeader><CardTitle className="text-base">자동 처리 항목</CardTitle></CardHeader><CardContent><ul className="space-y-3 text-sm text-muted-foreground"><li>연락처 → 전화번호 매핑</li><li>하이픈·공백·+82 정규화</li><li>누락·중복 검사 및 비표준 번호 보존</li><li>`-` 값을 미입력으로 처리</li></ul></CardContent></Card></div>
    </form> : <PreviewResult preview={preview} saving={saving} onSave={requestSave} onReset={resetImport} />}
    <Dialog open={phoneErrorDialogOpen} onOpenChange={setPhoneErrorDialogOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>전화번호가 없는 행을 어떻게 처리할까요?</DialogTitle>
          <DialogDescription>
            전화번호가 없거나 숫자를 찾을 수 없는 행 {preview?.summary.errorRows ?? 0}건이
            있습니다. 해당 행을 제외하고 유효한 {preview?.summary.validRows ?? 0}건만
            등록하거나, 파일을 수정해 다시 등록할 수 있습니다.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="sm:justify-between">
          <Button type="button" variant="outline" onClick={resetImport} disabled={saving}>
            파일 수정 후 다시 등록
          </Button>
          <Button
            type="button"
            onClick={() => {
              setPhoneErrorDialogOpen(false);
              void saveImport(true);
            }}
            disabled={saving || (preview?.summary.validRows ?? 0) === 0}
          >
            {saving ? <Loader2 className="animate-spin" /> : <FileSpreadsheet />}
            오류 행 제외하고 등록
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}

function PreviewResult({ preview, saving, onSave, onReset }: { preview: ImportPreview; saving: boolean; onSave: () => void; onReset: () => void }) {
  return <div className="mt-8 space-y-6">
    <Alert><CheckCircle2 /><AlertTitle>CSV 분석이 완료되었습니다</AlertTitle><AlertDescription>{preview.file.name} · SHA-256 {preview.file.checksumSha256.slice(0, 12)}…</AlertDescription></Alert>
    <div className="grid gap-4 sm:grid-cols-4">{[["전체 행", preview.summary.totalRows], ["유효 행", preview.summary.validRows], ["오류 행", preview.summary.errorRows], ["중복 그룹", preview.summary.duplicateGroups]].map(([label, value]) => <Card key={label}><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle></CardHeader><CardContent><strong className="font-mono text-2xl">{value}</strong></CardContent></Card>)}</div>
    <Card className="overflow-hidden"><CardHeader><CardTitle>상위 5행 미리보기</CardTitle><CardDescription>파일에서 읽은 이름, 이메일과 정규화된 전화번호를 그대로 표시합니다.</CardDescription></CardHeader><Table><TableHeader><TableRow><TableHead>강의명</TableHead><TableHead>옵션명</TableHead><TableHead>이름</TableHead><TableHead>이메일</TableHead><TableHead>전화번호</TableHead><TableHead>유입 경로</TableHead><TableHead>광고 매체</TableHead></TableRow></TableHeader><TableBody>{preview.preview.map((row, index) => <TableRow key={`${row.phone}-${index}`}><TableCell className="max-w-64 truncate">{row.courseName}</TableCell><TableCell>{row.optionName}</TableCell><TableCell>{row.customerName}</TableCell><TableCell>{row.email}</TableCell><TableCell className="font-mono">{row.phone}</TableCell><TableCell>{row.source || "미분류"}</TableCell><TableCell>{row.adMedia || "미분류"}</TableCell></TableRow>)}</TableBody></Table></Card>
    {preview.errors.length > 0 && <Alert variant="destructive"><AlertCircle /><AlertTitle>오류 {preview.summary.errorRows}건</AlertTitle><AlertDescription>{preview.errors.slice(0, 3).map((item) => `${item.rowNumber}행: ${item.reason}`).join(" · ")}</AlertDescription></Alert>}
    <div className="flex flex-col justify-between gap-3 sm:flex-row"><Button variant="outline" onClick={onReset}><X />다른 파일 선택</Button><Button onClick={onSave} disabled={saving}>{saving ? <><Loader2 className="animate-spin" />저장 중</> : <><FileSpreadsheet />{preview.summary.errorRows > 0 ? "등록 방법 선택" : "명단 저장"}</>}</Button></div>
  </div>;
}
