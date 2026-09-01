"use client";

import { readSheet } from "read-excel-file/browser";
import {
  Calculator,
  CheckCircle2,
  Download,
  Eye,
  FileSpreadsheet,
  Loader2,
  PhoneCall,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  PHONE_SALES_STAFF_CAPACITY,
  PHONE_SALES_STAFF_COST,
  buildPhoneSalesCsv,
  formatPhoneSalesPhone,
  phoneSalesListFilename,
  type PhoneSalesContact,
  type PhoneSalesJobDetail,
  type PhoneSalesJobSummary,
} from "@/lib/phone-sales/jobs";

type ParsedContact = {
  name: string;
  phone: string;
  email: string;
  sourceFile: string;
};

type BuildResult = {
  jobId?: string;
  createdAt?: string;
  updatedAt?: string;
  freeFilenames: string[];
  paidFilenames: string[];
  freeCount: number;
  paidCount: number;
  excludedCount: number;
  contacts: PhoneSalesContact[];
};

const HEADER_ALIASES = {
  name: ["이름", "성명", "신청자", "회원명", "고객명", "수강생", "name"],
  phone: [
    "전화번호",
    "연락처",
    "휴대폰",
    "휴대전화",
    "핸드폰",
    "휴대폰번호",
    "phone",
    "mobile",
  ],
  email: ["이메일", "메일", "email", "e-mail"],
} as const;

function cellText(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  return String(value ?? "").trim();
}

function normalizeHeader(value: unknown) {
  return cellText(value).replace(/\s/gu, "").toLocaleLowerCase("ko-KR");
}

function normalizePhone(value: unknown) {
  const digits = cellText(value).replace(/\D/gu, "");
  const normalized = /^10\d{8}$/u.test(digits) ? `0${digits}` : digits;
  return /^0\d{9,10}$/u.test(normalized) ? normalized : "";
}

function findColumn(header: unknown[], aliases: readonly string[]) {
  const normalizedAliases = aliases.map((alias) => normalizeHeader(alias));
  return header.findIndex((cell) => {
    const text = normalizeHeader(cell);
    return normalizedAliases.some((alias) => text.includes(alias));
  });
}

function columnMap(rows: unknown[][]) {
  const header = rows[0] ?? [];
  const phone = findColumn(header, HEADER_ALIASES.phone);
  return {
    hasHeader: phone >= 0,
    name: findColumn(header, HEADER_ALIASES.name),
    phone,
    email: findColumn(header, HEADER_ALIASES.email),
  };
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

async function readRows(file: File) {
  if (file.name.toLocaleLowerCase("ko-KR").endsWith(".csv")) {
    return parseCsv(await file.text());
  }
  return (await readSheet(file)) as unknown[][];
}

async function parseContactFiles(files: File[]) {
  const parsed: ParsedContact[] = [];

  for (const file of files) {
    const rows = await readRows(file);
    const columns = columnMap(rows);
    const dataRows = columns.hasHeader ? rows.slice(1) : rows;
    const phoneIndex = columns.hasHeader ? columns.phone : 1;
    const nameIndex = columns.hasHeader && columns.name >= 0 ? columns.name : 0;
    const emailIndex =
      columns.hasHeader && columns.email >= 0 ? columns.email : 2;

    for (const row of dataRows) {
      const phone = normalizePhone(row[phoneIndex]);
      if (!phone) continue;
      parsed.push({
        name: cellText(row[nameIndex]),
        phone,
        email: cellText(row[emailIndex]),
        sourceFile: file.name,
      });
    }
  }

  return parsed;
}

function mergeFreeContacts(contacts: ParsedContact[]) {
  const merged = new Map<string, PhoneSalesContact>();
  for (const contact of contacts) {
    const existing = merged.get(contact.phone);
    if (existing) {
      if (!existing.name && contact.name) existing.name = contact.name;
      if (!existing.email && contact.email) existing.email = contact.email;
      if (!existing.sourceFiles.includes(contact.sourceFile)) {
        existing.sourceFiles.push(contact.sourceFile);
      }
      continue;
    }

    merged.set(contact.phone, {
      name: contact.name,
      phone: contact.phone,
      email: contact.email,
      sourceFiles: [contact.sourceFile],
    });
  }
  return merged;
}

function fileSummary(files: File[], savedFilenames: string[]) {
  if (files.length) return `${files.length.toLocaleString("ko-KR")}개 파일`;
  if (savedFilenames.length) {
    return `저장된 파일 ${savedFilenames.length.toLocaleString("ko-KR")}개`;
  }
  return "선택된 파일이 없습니다";
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function staffCountFor(count: number) {
  return Math.ceil(count / PHONE_SALES_STAFF_CAPACITY);
}

function jobToResult(job: PhoneSalesJobDetail): BuildResult {
  return {
    jobId: job.id,
    createdAt: job.created_at,
    updatedAt: job.updated_at,
    freeFilenames: job.free_filenames,
    paidFilenames: job.paid_filenames,
    freeCount: job.free_count,
    paidCount: job.paid_count,
    excludedCount: job.excluded_count,
    contacts: job.contacts,
  };
}

function downloadLocalCsv(
  contacts: PhoneSalesContact[],
  instructorName: string,
  createdAt: string,
) {
  const blob = new Blob([buildPhoneSalesCsv(contacts)], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = phoneSalesListFilename(instructorName, createdAt);
  anchor.click();
  URL.revokeObjectURL(url);
}

function FileList({
  files,
  savedFilenames,
}: {
  files: File[];
  savedFilenames: string[];
}) {
  const items = files.length
    ? files.map((file) => ({
        key: `${file.name}-${file.size}-${file.lastModified}`,
        name: file.name,
        detail: `${(file.size / 1024 / 1024).toFixed(2)} MiB`,
      }))
    : savedFilenames.map((name) => ({
        key: name,
        name,
        detail: "저장된 원본 파일명",
      }));

  if (!items.length) return null;

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.key} className="rounded-lg border p-3">
          <p className="font-medium">{item.name}</p>
          <p className="text-sm text-muted-foreground">{item.detail}</p>
        </div>
      ))}
    </div>
  );
}

function payloadFromResult(result: BuildResult, instructorName: string) {
  return {
    instructorName,
    freeFilenames: result.freeFilenames,
    paidFilenames: result.paidFilenames,
    freeCount: result.freeCount,
    paidCount: result.paidCount,
    excludedCount: result.excludedCount,
    contacts: result.contacts,
  };
}

export function PhoneSalesListMaker({
  initialJob,
}: {
  initialJob?: PhoneSalesJobDetail | null;
}) {
  const router = useRouter();
  const initialResult = useMemo(
    () => (initialJob ? jobToResult(initialJob) : null),
    [initialJob],
  );
  const [instructorName, setInstructorName] = useState(
    initialJob?.instructor_name ?? "",
  );
  const [freeFiles, setFreeFiles] = useState<File[]>([]);
  const [paidFiles, setPaidFiles] = useState<File[]>([]);
  const [result, setResult] = useState<BuildResult | null>(initialResult);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const savedFreeFilenames = result?.freeFilenames ?? [];
  const savedPaidFilenames = result?.paidFilenames ?? [];
  const hasReplacementFiles = freeFiles.length > 0;
  const canSave =
    Boolean(instructorName.trim()) &&
    (freeFiles.length > 0 || (Boolean(result?.contacts) && !paidFiles.length));
  const staffCount = result ? staffCountFor(result.contacts.length) : 0;
  const totalCost = staffCount * PHONE_SALES_STAFF_COST;
  const downloadName =
    result?.createdAt &&
    phoneSalesListFilename(instructorName, result.createdAt);

  async function saveResult(nextResult: BuildResult) {
    const endpoint = nextResult.jobId
      ? `/api/phone-sales-jobs/${nextResult.jobId}`
      : "/api/phone-sales-jobs";
    const response = await fetch(endpoint, {
      method: nextResult.jobId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payloadFromResult(nextResult, instructorName.trim())),
    });
    const body = (await response.json()) as {
      id?: string;
      created_at?: string;
      updated_at?: string;
      message?: string;
    };
    if (!response.ok) {
      throw new Error(body.message ?? "전화세일즈 작업 저장에 실패했습니다.");
    }
    return {
      ...nextResult,
      jobId: body.id ?? nextResult.jobId,
      createdAt: body.created_at ?? nextResult.createdAt,
      updatedAt: body.updated_at ?? nextResult.updatedAt,
    };
  }

  async function buildList() {
    if (!canSave) return;
    setBusy(true);
    setError("");

    try {
      let nextResult = result;
      if (freeFiles.length) {
        const [freeContacts, paidContacts] = await Promise.all([
          parseContactFiles(freeFiles),
          parseContactFiles(paidFiles),
        ]);
        const freeMap = mergeFreeContacts(freeContacts);
        const paidPhones = new Set(paidContacts.map((contact) => contact.phone));
        const contacts = Array.from(freeMap.values())
          .filter((contact) => !paidPhones.has(contact.phone))
          .sort((a, b) => a.name.localeCompare(b.name, "ko-KR"));

        nextResult = {
          jobId: result?.jobId,
          createdAt: result?.createdAt,
          updatedAt: result?.updatedAt,
          freeFilenames: freeFiles.map((file) => file.name),
          paidFilenames: paidFiles.map((file) => file.name),
          freeCount: freeMap.size,
          paidCount: paidPhones.size,
          excludedCount: freeMap.size - contacts.length,
          contacts,
        };
      }

      if (!nextResult) return;
      const saved = await saveResult(nextResult);
      setResult(saved);
      setFreeFiles([]);
      setPaidFiles([]);
      router.refresh();
      if (!initialJob && saved.jobId) {
        router.push(`/services/phone-sales-list/${saved.jobId}`);
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "명단을 만들지 못했습니다. 파일 형식을 확인해 주세요.",
      );
    } finally {
      setBusy(false);
    }
  }

  function downloadResult() {
    if (!result) return;
    if (result.jobId) {
      const anchor = document.createElement("a");
      anchor.href = `/api/phone-sales-jobs/${result.jobId}/download`;
      anchor.click();
      return;
    }
    downloadLocalCsv(result.contacts, instructorName, new Date().toISOString());
  }

  function clearAll() {
    setFreeFiles([]);
    setPaidFiles([]);
    setInstructorName(initialJob?.instructor_name ?? "");
    setResult(initialResult);
    setError("");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <Badge className="mb-3 bg-emerald-600 text-white hover:bg-emerald-600">
            SALES LIST
          </Badge>
          <h1 className="text-3xl font-semibold tracking-tight">
            전화세일즈 명단 만들기
          </h1>
          <p className="mt-2 max-w-3xl text-muted-foreground">
            무료강의 신청자 명단을 합치고 유료강의 신청자를 제외해 전화로
            세일즈할 대상 목록을 저장합니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" asChild>
            <Link href="/services/phone-sales-list">작업 목록</Link>
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy || (!freeFiles.length && !paidFiles.length && !initialJob)}
            onClick={clearAll}
          >
            <X /> 초기화
          </Button>
          {result ? (
            <Button type="button" variant="outline" onClick={downloadResult}>
              <Download /> 다시 다운로드
            </Button>
          ) : null}
          <Button
            type="button"
            className="bg-emerald-600 text-white hover:bg-emerald-700"
            disabled={busy || !canSave}
            onClick={() => void buildList()}
          >
            {busy ? (
              <Loader2 className="animate-spin" />
            ) : hasReplacementFiles ? (
              <PhoneCall />
            ) : (
              <Save />
            )}
            {busy
              ? "저장 중"
              : hasReplacementFiles
                ? "명단 다시 만들고 저장"
                : result
                  ? "강사명 저장"
                  : "전화번호 목록 만들기"}
          </Button>
        </div>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>전화세일즈 작업 저장 실패</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>작업 정보</CardTitle>
          {result?.createdAt ? (
            <CardDescription>
              만든 시간 {formatDateTime(result.createdAt)}
              {result.updatedAt
                ? ` · 마지막 수정 ${formatDateTime(result.updatedAt)}`
                : ""}
            </CardDescription>
          ) : null}
        </CardHeader>
        <CardContent className="grid gap-2">
          <Label htmlFor="phone-sales-instructor">강사명</Label>
          <Input
            id="phone-sales-instructor"
            placeholder="예: 홍길동"
            value={instructorName}
            onChange={(event) => {
              setInstructorName(event.target.value);
              setError("");
            }}
          />
          <p className="text-sm text-muted-foreground">
            다운로드 파일명:{" "}
            {downloadName ??
              phoneSalesListFilename(instructorName, new Date().toISOString())}
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="border-emerald-500/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="text-emerald-600" />
              무료강의 신청자 명단
            </CardTitle>
            <CardDescription>
              상세 화면에서 새 파일을 선택하면 기존 목록파일이 교체됩니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Label
              htmlFor="free-sales-files"
              className="flex min-h-52 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed bg-emerald-500/[0.04] p-6 text-center transition-colors hover:bg-emerald-500/10"
            >
              <FileSpreadsheet className="mb-4 size-10 text-emerald-600" />
              <span className="font-semibold">
                {fileSummary(freeFiles, savedFreeFilenames)}
              </span>
              <span className="mt-2 text-sm text-muted-foreground">
                무료강의 신청자 엑셀 또는 CSV를 여러 개 선택하세요.
              </span>
              <Input
                id="free-sales-files"
                type="file"
                multiple
                accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                className="sr-only"
                onChange={(event) => {
                  setFreeFiles(Array.from(event.target.files ?? []));
                  setError("");
                }}
              />
            </Label>
            <FileList files={freeFiles} savedFilenames={savedFreeFilenames} />
          </CardContent>
        </Card>

        <Card className="border-rose-500/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="text-rose-600" />
              유료강의 신청자 명단
            </CardTitle>
            <CardDescription>
              유료 명단만 바꾸려면 무료 명단도 함께 다시 선택해 주세요.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Label
              htmlFor="paid-sales-files"
              className="flex min-h-52 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed bg-rose-500/[0.04] p-6 text-center transition-colors hover:bg-rose-500/10"
            >
              <FileSpreadsheet className="mb-4 size-10 text-rose-600" />
              <span className="font-semibold">
                {fileSummary(paidFiles, savedPaidFilenames)}
              </span>
              <span className="mt-2 text-sm text-muted-foreground">
                이미 결제한 유료강의 명단을 여러 개 선택하세요.
              </span>
              <Input
                id="paid-sales-files"
                type="file"
                multiple
                accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                className="sr-only"
                onChange={(event) => {
                  setPaidFiles(Array.from(event.target.files ?? []));
                  setError("");
                }}
              />
            </Label>
            <FileList files={paidFiles} savedFilenames={savedPaidFilenames} />
          </CardContent>
        </Card>
      </div>

      {result ? (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <MetricCard label="무료 중복 제거" value={result.freeCount} />
            <MetricCard label="유료 제외 대상" value={result.excludedCount} />
            <MetricCard
              label="최종 전화 대상"
              value={result.contacts.length}
              highlight
            />
            <MetricCard label="유료 명단 고유값" value={result.paidCount} />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card className="border-emerald-500/30 bg-emerald-500/5">
              <CardContent className="flex items-center gap-4 p-5">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-emerald-600 text-white">
                  <PhoneCall className="size-5" />
                </span>
                <div>
                  <p className="text-sm text-muted-foreground">필요 콜직원</p>
                  <p className="mt-1 text-2xl font-semibold">
                    {staffCount.toLocaleString("ko-KR")}명
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    1명당 {PHONE_SALES_STAFF_CAPACITY.toLocaleString("ko-KR")}
                    명 담당
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-amber-500/30 bg-amber-500/5">
              <CardContent className="flex items-center gap-4 p-5">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-amber-600 text-white">
                  <Calculator className="size-5" />
                </span>
                <div>
                  <p className="text-sm text-muted-foreground">예상 비용</p>
                  <p className="mt-1 text-2xl font-semibold">
                    {totalCost.toLocaleString("ko-KR")}원
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    1명당 {PHONE_SALES_STAFF_COST.toLocaleString("ko-KR")}원
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Alert className="border-emerald-500/40 bg-emerald-500/5">
            <CheckCircle2 className="text-emerald-600" />
            <AlertTitle>전화세일즈 작업이 저장되어 있습니다.</AlertTitle>
            <AlertDescription>
              {downloadName} 파일로 언제든 다시 다운로드할 수 있습니다.
            </AlertDescription>
          </Alert>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calculator />
                최종 명단 미리보기
              </CardTitle>
            </CardHeader>
            <CardContent>
              {result.contacts.length ? (
                <div className="overflow-hidden rounded-xl border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>이름</TableHead>
                        <TableHead>전화번호</TableHead>
                        <TableHead>이메일</TableHead>
                        <TableHead>출처</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.contacts.slice(0, 20).map((contact) => (
                        <TableRow key={contact.phone}>
                          <TableCell className="font-medium">
                            {contact.name || "-"}
                          </TableCell>
                          <TableCell className="font-mono">
                            {formatPhoneSalesPhone(contact.phone)}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {contact.email || "-"}
                          </TableCell>
                          <TableCell className="max-w-72 truncate text-muted-foreground">
                            {contact.sourceFiles.join(" / ")}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed py-12 text-center text-muted-foreground">
                  유료강의 명단을 제외한 전화 대상이 없습니다.
                </div>
              )}
              {result.contacts.length > 20 ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  화면에는 앞 20명만 표시합니다. 전체 명단은 CSV에서 확인하세요.
                </p>
              ) : null}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

function MetricCard({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <Card className={highlight ? "border-emerald-500/30 bg-emerald-500/5" : ""}>
      <CardContent className="p-5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-2 text-2xl font-semibold">
          {value.toLocaleString("ko-KR")}명
        </p>
      </CardContent>
    </Card>
  );
}

export function PhoneSalesJobList({
  jobs,
  loadError,
}: {
  jobs: PhoneSalesJobSummary[];
  loadError?: string;
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <Badge className="mb-3 bg-emerald-600 text-white hover:bg-emerald-600">
            SALES LIST
          </Badge>
          <h1 className="text-3xl font-semibold tracking-tight">
            전화세일즈 명단 만들기
          </h1>
          <p className="mt-2 max-w-3xl text-muted-foreground">
            저장된 전화세일즈 작업을 다시 확인하고 다운로드할 수 있습니다.
          </p>
        </div>
        <Button className="bg-emerald-600 text-white hover:bg-emerald-700" asChild>
          <Link href="/services/phone-sales-list/new">
            <Plus /> 새 작업 만들기
          </Link>
        </Button>
      </div>

      {loadError ? (
        <Alert variant="destructive">
          <AlertTitle>작업 목록을 불러오지 못했습니다</AlertTitle>
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>저장된 작업</CardTitle>
          <CardDescription>
            만든 날짜와 결과 인원, 예상 콜직원 비용을 한 번에 확인합니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {jobs.length ? (
            <div className="overflow-hidden rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>강사명</TableHead>
                    <TableHead>만든 시간</TableHead>
                    <TableHead className="text-right">최종 인원</TableHead>
                    <TableHead className="text-right">콜직원</TableHead>
                    <TableHead className="text-right">예상 비용</TableHead>
                    <TableHead>
                      <span className="sr-only">작업</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobs.map((job) => {
                    const staffCount = staffCountFor(job.result_count);
                    return (
                      <TableRow key={job.id}>
                        <TableCell className="font-medium">
                          <Link
                            className="hover:underline"
                            href={`/services/phone-sales-list/${job.id}`}
                          >
                            {job.instructor_name}
                          </Link>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDateTime(job.created_at)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {job.result_count.toLocaleString("ko-KR")}명
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {staffCount.toLocaleString("ko-KR")}명
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {(staffCount * PHONE_SALES_STAFF_COST).toLocaleString(
                            "ko-KR",
                          )}
                          원
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button variant="outline" size="sm" asChild>
                              <Link href={`/services/phone-sales-list/${job.id}`}>
                                <Eye /> 상세보기
                              </Link>
                            </Button>
                            <Button variant="outline" size="sm" asChild>
                              <a href={`/api/phone-sales-jobs/${job.id}/download`}>
                                <Download /> 다운로드
                              </a>
                            </Button>
                            <DeletePhoneSalesJobButton job={job} />
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed py-12 text-center">
              <p className="font-medium">저장된 전화세일즈 작업이 없습니다.</p>
              <p className="mt-2 text-sm text-muted-foreground">
                무료/유료 명단을 올려 첫 작업을 만들어 보세요.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DeletePhoneSalesJobButton({ job }: { job: PhoneSalesJobSummary }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  async function deleteJob() {
    setDeleting(true);
    setError("");
    try {
      const response = await fetch(`/api/phone-sales-jobs/${job.id}`, {
        method: "DELETE",
      });
      const body = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(body.message ?? "전화세일즈 작업 삭제에 실패했습니다.");
      }
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "전화세일즈 작업 삭제에 실패했습니다.",
      );
      setDeleting(false);
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`${job.instructor_name} 삭제`}
        >
          <Trash2 />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>전화세일즈 작업을 삭제할까요?</AlertDialogTitle>
          <AlertDialogDescription>
            <strong>{job.instructor_name}</strong> 작업과 저장된 명단이 삭제됩니다.
            이 작업은 되돌릴 수 없습니다.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>취소</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={(event) => {
              event.preventDefault();
              void deleteJob();
            }}
            disabled={deleting}
          >
            {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
            삭제
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
