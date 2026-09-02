"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  Download,
  History,
  Loader2,
  MessageSquareText,
  Search,
  Send,
  TestTube2,
} from "lucide-react";

import { RosterUpdateDialog } from "@/components/jobs/roster-update-dialog";
import { RosterAnalysisCards } from "@/components/jobs/roster-analysis-cards";
import { DeleteSelectedEnrollmentsButton } from "@/components/jobs/delete-selected-enrollments-button";
import { EnrollmentMemoInput } from "@/components/jobs/enrollment-memo-input";
import { ManualEnrollmentDialog } from "@/components/jobs/manual-enrollment-dialog";
import { RosterNotesCard } from "@/components/jobs/roster-notes-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  analyzeRosterOptions,
  analyzeRosterSources,
  filterGroupChatNonParticipants,
  filterRosterRows,
  formatPhone,
  sortRosterRows,
  uniqueValues,
} from "@/lib/jobs/filter";
import {
  buildTargetContactCsv,
  targetContactCsvFileName,
} from "@/lib/jobs/target-csv";
import {
  EMPTY_ROSTER_FILTERS,
  type LinkedCourseOptionInvite,
  type RosterFilters,
  type RosterRow,
  type RosterSort,
} from "@/lib/jobs/types";
import type { CourseJobNote } from "@/lib/jobs/notes";
import {
  buildCourseOptionInviteMap,
  optionKey,
  optionLabel,
  validateInviteValues,
  type InviteValues,
} from "@/lib/messages/invite";
import {
  recommendInviteLinks,
  type InviteLinkSuggestion,
} from "@/lib/messages/invite-suggestions";
import {
  MESSAGE_SCOPE_LABELS,
  MESSAGE_TEMPLATE_LABELS,
  type MessageHistoryItem,
} from "@/lib/messages/types";
import { hasProcessingMessageJob } from "@/lib/messages/dispatch";

type Props = {
  jobId: string;
  jobName: string;
  jobVersion: number;
  jobStatus: string;
  defaultCourseName: string;
  rows: RosterRow[];
  messageHistory: MessageHistoryItem[];
  linkedCourseOptionInvites: LinkedCourseOptionInvite[];
  hasLinkedCourse: boolean;
  currentUserId: string;
  currentUserEmail: string;
  notes: CourseJobNote[];
  notesError?: string;
  loadError?: string;
  historyError?: string;
};
type Scope = "all" | "filtered" | "selected";
const EMPTY_OPTION_INVITES: Record<string, InviteValues> = {};

export function RosterDetailClient({
  jobId,
  jobName,
  jobVersion,
  jobStatus,
  defaultCourseName,
  rows: initialRows,
  messageHistory,
  linkedCourseOptionInvites,
  hasLinkedCourse,
  currentUserId,
  currentUserEmail,
  notes,
  notesError,
  loadError,
  historyError,
}: Props) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [filters, setFilters] = useState<RosterFilters>(EMPTY_ROSTER_FILTERS);
  const [sort, setSort] = useState<RosterSort>("original");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState(false);
  const [savingParticipation, setSavingParticipation] = useState<Set<string>>(
    new Set(),
  );
  const [savingExtraParticipant, setSavingExtraParticipant] = useState<
    Set<string>
  >(new Set());
  const courseName =
    defaultCourseName ||
    rows.find((row) => row.values.courseName)?.values.courseName ||
    "";
  const sortedRows = useMemo(() => sortRosterRows(rows, sort), [rows, sort]);
  const filteredRows = useMemo(
    () => filterRosterRows(sortedRows, filters),
    [sortedRows, filters],
  );
  const sourceAnalysis = useMemo(() => analyzeRosterSources(rows), [rows]);
  const optionAnalysis = useMemo(() => analyzeRosterOptions(rows), [rows]);
  const selectedRows = sortedRows.filter((row) => selected.has(row.id));
  const allFilteredSelected =
    filteredRows.length > 0 &&
    filteredRows.every((row) => selected.has(row.id));
  const hasProcessingJob = hasProcessingMessageJob(messageHistory);
  const linkedOptionInvites = useMemo(
    () =>
      buildCourseOptionInviteMap(
        rows.map((row) => row.values.optionName),
        linkedCourseOptionInvites,
      ),
    [linkedCourseOptionInvites, rows],
  );
  const linkedOptionInviteVersion = linkedCourseOptionInvites
    .map((option) => `${option.optionName}:${option.entryCode}:${option.linkName}`)
    .join("|");

  useEffect(() => {
    if (!hasProcessingJob) return;
    const timer = window.setInterval(() => router.refresh(), 3_000);
    return () => window.clearInterval(timer);
  }, [hasProcessingJob, router]);

  function setFilter<K extends keyof RosterFilters>(
    key: K,
    value: RosterFilters[K],
  ) {
    setFilters((current) => ({ ...current, [key]: value }));
  }
  function toggleRow(id: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }
  function toggleFiltered(checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      filteredRows.forEach((row) => {
        if (checked) next.add(row.id);
        else next.delete(row.id);
      });
      return next;
    });
  }
  async function toggleGroupChatJoined(row: RosterRow, checked: boolean) {
    setRows((current) =>
      current.map((item) =>
        item.id === row.id ? { ...item, groupChatJoined: checked } : item,
      ),
    );
    setSavingParticipation((current) => new Set(current).add(row.id));

    try {
      const response = await fetch(`/api/jobs/${jobId}/enrollments/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupChatJoined: checked }),
      });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(
          body.message ?? "단톡방 참여 여부를 저장하지 못했습니다.",
        );
      }
    } catch (error) {
      setRows((current) =>
        current.map((item) =>
          item.id === row.id
            ? { ...item, groupChatJoined: row.groupChatJoined }
            : item,
        ),
      );
      window.alert(
        error instanceof Error
          ? error.message
          : "단톡방 참여 여부를 저장하지 못했습니다.",
      );
    } finally {
      setSavingParticipation((current) => {
        const next = new Set(current);
        next.delete(row.id);
        return next;
      });
    }
  }
  async function toggleExtraParticipant(row: RosterRow, checked: boolean) {
    setRows((current) =>
      current.map((item) =>
        item.id === row.id ? { ...item, isExtraParticipant: checked } : item,
      ),
    );
    setSavingExtraParticipant((current) => new Set(current).add(row.id));

    try {
      const response = await fetch(`/api/jobs/${jobId}/enrollments/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isExtraParticipant: checked }),
      });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(
          body.message ?? "별도 추가 인원 여부를 저장하지 못했습니다.",
        );
      }
    } catch (error) {
      setRows((current) =>
        current.map((item) =>
          item.id === row.id
            ? { ...item, isExtraParticipant: row.isExtraParticipant }
            : item,
        ),
      );
      window.alert(
        error instanceof Error
          ? error.message
          : "별도 추가 인원 여부를 저장하지 못했습니다.",
      );
    } finally {
      setSavingExtraParticipant((current) => {
        const next = new Set(current);
        next.delete(row.id);
        return next;
      });
    }
  }
  async function download(scope: "filtered" | "selected") {
    setDownloading(true);
    try {
      const response = await fetch(`/api/jobs/${jobId}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope, filters, selectedIds: [...selected] }),
      });
      if (!response.ok)
        throw new Error(
          (await response.json()).message ?? "엑셀 생성에 실패했습니다.",
        );
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${jobName}-${scope === "selected" ? "선택" : "필터"}.xlsx`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : "엑셀 생성에 실패했습니다.",
      );
    } finally {
      setDownloading(false);
    }
  }

  if (loadError)
    return (
      <Alert variant="destructive">
        <AlertTitle>상세 명단을 불러오지 못했습니다.</AlertTitle>
        <AlertDescription>{loadError}</AlertDescription>
      </Alert>
    );
  if (rows.length === 0)
    return (
      <Alert>
        <AlertTitle>저장된 상세 명단이 없습니다.</AlertTitle>
        <AlertDescription>
          이전에 만든 작업이라면 상세 데이터 보강 작업을 실행해야 합니다.
        </AlertDescription>
      </Alert>
    );

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
        <div className="min-w-0">
          <Badge variant="outline" className="mb-3">
            v{jobVersion} · {jobStatus === "ready" ? "분석 완료" : jobStatus}
          </Badge>
          <h1 className="text-3xl font-semibold tracking-tight">
            {jobName}{courseName ? ` (${courseName})` : ""}
          </h1>
          <p className="mt-2 text-muted-foreground">
            최신 명단을 조회하고 필터링하거나 메시지를 발송할 수 있습니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 lg:max-w-[62%] lg:justify-end">
          <DeleteSelectedEnrollmentsButton
            jobId={jobId}
            selectedIds={selectedRows.map((row) => row.id)}
          />
          <MessageDialog
            key={`group-chat-invite-${linkedOptionInviteVersion}`}
            jobId={jobId}
            jobName={jobName}
            defaultCourseName={defaultCourseName}
            rows={sortedRows}
            filteredRows={filteredRows}
            selectedRows={selectedRows}
            filters={filters}
            mode="groupChatInvite"
            defaultOptionInvites={linkedOptionInvites}
            disabled={!hasLinkedCourse}
          />
          <MessageDialog
            jobId={jobId}
            jobName={jobName}
            defaultCourseName={defaultCourseName}
            rows={sortedRows}
            filteredRows={filteredRows}
            selectedRows={selectedRows}
            filters={filters}
          />
        </div>
      </div>
      <Card>
        <CardHeader className="border-b">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>명단 정보 및 필터</CardTitle>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">
                전체 {rows.length.toLocaleString("ko-KR")}명
              </Badge>
              <Badge variant="secondary">
                필터 결과 {filteredRows.length.toLocaleString("ko-KR")}명
              </Badge>
              <Badge variant={selected.size > 0 ? "default" : "outline"}>
                선택 {selected.size.toLocaleString("ko-KR")}명
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <div className="relative">
              <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="이름·전화·이메일·추천인·비고"
                aria-label="수강생 검색"
                value={filters.keyword}
                onChange={(event) => setFilter("keyword", event.target.value)}
              />
            </div>
            <FilterSelect
              value={filters.courseName}
              placeholder="전체 강의"
              values={uniqueValues(rows, "courseName")}
              onChange={(value) => setFilter("courseName", value)}
            />
            <FilterSelect
              value={filters.optionName}
              placeholder="전체 옵션"
              values={uniqueValues(rows, "optionName")}
              onChange={(value) => setFilter("optionName", value)}
            />
            <FilterSelect
              value={filters.source}
              placeholder="전체 유입 경로"
              values={uniqueValues(rows, "source")}
              onChange={(value) => setFilter("source", value)}
            />
            <FilterSelect
              value={filters.adMedia}
              placeholder="전체 광고 매체"
              values={uniqueValues(rows, "adMedia")}
              onChange={(value) => setFilter("adMedia", value)}
            />
            <Select
              value={filters.groupChat}
              onValueChange={(value) =>
                setFilter("groupChat", value as RosterFilters["groupChat"])
              }
            >
              <SelectTrigger aria-label="단톡방 입장 여부">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체</SelectItem>
                <SelectItem value="notJoined">
                  단톡방 입장 안한 사람
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t pt-4">
            <RosterUpdateDialog jobId={jobId} />
            <ManualEnrollmentDialog
              jobId={jobId}
              courseName={courseName}
              onAdded={(row) => setRows((current) => [...current, row])}
            />
            <Select
              value={sort}
              onValueChange={(value) => setSort(value as RosterSort)}
            >
              <SelectTrigger className="w-44" aria-label="수강생 이름 정렬">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="original">원래 목록순</SelectItem>
                <SelectItem value="nameAsc">이름 오름차순</SelectItem>
                <SelectItem value="nameDesc">이름 내림차순</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              onClick={() => setSort("original")}
              disabled={sort === "original"}
            >
              원래 목록대로
            </Button>
            <Button
              variant="outline"
              onClick={() => download("filtered")}
              disabled={downloading || filteredRows.length === 0}
            >
              {downloading ? <Loader2 className="animate-spin" /> : <Download />}
              필터 결과 엑셀
            </Button>
            <Button
              variant="outline"
              onClick={() => download("selected")}
              disabled={downloading || selected.size === 0}
            >
              <Download />
              선택 엑셀
            </Button>
          </div>
        </CardContent>
      </Card>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    aria-label="필터 결과 전체 선택"
                    checked={allFilteredSelected}
                    onCheckedChange={(value) => toggleFiltered(value === true)}
                  />
                </TableHead>
                <TableHead>고객명</TableHead>
                <TableHead className="whitespace-nowrap text-center">
                  단톡방 참여
                </TableHead>
                <TableHead className="whitespace-nowrap text-center">
                  별도 추가 인원
                </TableHead>
                <TableHead>연락처</TableHead>
                <TableHead>이메일</TableHead>
                <TableHead>옵션명</TableHead>
                <TableHead>추천인</TableHead>
                <TableHead>유입 경로</TableHead>
                <TableHead>광고 매체</TableHead>
                <TableHead>비고</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={selected.has(row.id) ? "selected" : undefined}
                >
                  <TableCell>
                    <Checkbox
                      aria-label={`${row.values.customerName} 선택`}
                      checked={selected.has(row.id)}
                      onCheckedChange={(value) =>
                        toggleRow(row.id, value === true)
                      }
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                    {row.values.customerName || "-"}
                    {row.isDuplicate && (
                      <Badge variant="secondary" className="ml-2">
                        중복
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-center">
                      <Checkbox
                        aria-label={`${row.values.customerName || "수강생"} 단톡방 참여`}
                        checked={row.groupChatJoined}
                        disabled={savingParticipation.has(row.id)}
                        onCheckedChange={(value) =>
                          toggleGroupChatJoined(row, value === true)
                        }
                      />
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-center">
                      <Checkbox
                        aria-label={`${row.values.customerName || "수강생"} 별도 추가 인원`}
                        checked={row.isExtraParticipant}
                        disabled={savingExtraParticipant.has(row.id)}
                        onCheckedChange={(value) =>
                          toggleExtraParticipant(row, value === true)
                        }
                      />
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {formatPhone(row.normalizedPhone)}
                  </TableCell>
                  <TableCell>{row.values.email || "-"}</TableCell>
                  <TableCell>{row.values.optionName || "-"}</TableCell>
                  <TableCell>{row.values.referrer || "-"}</TableCell>
                  <TableCell>{row.values.source || "-"}</TableCell>
                  <TableCell>{row.values.adMedia || "-"}</TableCell>
                  <TableCell>
                    <EnrollmentMemoInput
                      jobId={jobId}
                      enrollmentId={row.id}
                      initialValue={row.memo}
                      studentName={row.values.customerName}
                      onSaved={(memo) =>
                        setRows((current) =>
                          current.map((item) =>
                            item.id === row.id ? { ...item, memo } : item,
                          ),
                        )
                      }
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {filteredRows.length === 0 && (
          <div className="py-16 text-center text-sm text-muted-foreground">
            조건에 맞는 수강생이 없습니다.
          </div>
        )}
      </Card>
      <RosterAnalysisCards
        sourceItems={sourceAnalysis}
        optionItems={optionAnalysis}
        totalCount={rows.length}
      />
      <RosterNotesCard
        jobId={jobId}
        currentUserId={currentUserId}
        currentUserEmail={currentUserEmail}
        initialNotes={notes}
        loadError={notesError}
      />
      <MessageHistoryCard
        jobId={jobId}
        items={messageHistory}
        error={historyError}
      />
    </div>
  );
}

function FilterSelect({
  value,
  placeholder,
  values,
  onChange,
}: {
  value: string;
  placeholder: string;
  values: string[];
  onChange: (value: string) => void;
}) {
  return (
    <Select
      value={value || "__all"}
      onValueChange={(next) => onChange(next === "__all" ? "" : next)}
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__all">{placeholder}</SelectItem>
        {values.map((item) => (
          <SelectItem key={item} value={item}>
            {item}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function MessageHistoryCard({
  jobId,
  items,
  error,
}: {
  jobId: string;
  items: MessageHistoryItem[];
  error?: string;
}) {
  if (error)
    return (
      <Alert variant="destructive">
        <AlertTitle>발송 이력을 불러오지 못했습니다.</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  return (
    <Card className="overflow-hidden">
      <details className="group">
        <summary className="cursor-pointer list-none rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden">
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="size-4" />
              발송 이력
              <Badge variant="secondary">{items.length}건</Badge>
            </CardTitle>
            <ChevronDown className="size-5 text-muted-foreground transition-transform group-open:rotate-180" />
          </CardHeader>
        </summary>
        {items.length === 0 ? (
          <CardContent>
            <p className="py-8 text-center text-sm text-muted-foreground">
              아직 발송 이력이 없습니다.
            </p>
          </CardContent>
        ) : (
          <div className="overflow-x-auto border-t">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>발송 시간</TableHead>
                  <TableHead>구분</TableHead>
                  <TableHead>템플릿</TableHead>
                  <TableHead className="text-right">대상</TableHead>
                  <TableHead className="text-right">성공</TableHead>
                  <TableHead className="text-right">실패</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead>
                    <span className="sr-only">상세보기</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDateTime(item.createdAt)}
                    </TableCell>
                    <TableCell>
                      {item.isTest ? (
                        <Badge variant="secondary">테스트</Badge>
                      ) : (
                        (MESSAGE_SCOPE_LABELS[item.targetScope] ??
                        item.targetScope)
                      )}
                    </TableCell>
                    <TableCell className="font-medium">
                      {MESSAGE_TEMPLATE_LABELS[item.templateKey]}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {item.requestedCount}
                    </TableCell>
                    <TableCell className="text-right font-mono text-emerald-600">
                      {item.successCount}
                    </TableCell>
                    <TableCell className="text-right font-mono text-destructive">
                      {item.failedCount}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          item.status === "completed"
                            ? "default"
                            : item.status === "failed"
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {item.status === "completed"
                          ? "완료"
                          : item.status === "failed"
                            ? "실패"
                            : item.status === "partial_failed"
                              ? "일부 실패"
                              : "처리 중"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm" asChild>
                        <Link
                          href={`/services/course-roster/${jobId}/messages/${item.detailId}`}
                        >
                          상세보기
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </details>
    </Card>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function MessageDialog({
  jobId,
  jobName,
  defaultCourseName,
  rows,
  filteredRows,
  selectedRows,
  filters,
  mode = "standard",
  defaultOptionInvites = EMPTY_OPTION_INVITES,
  disabled = false,
}: {
  jobId: string;
  jobName: string;
  defaultCourseName: string;
  rows: RosterRow[];
  filteredRows: RosterRow[];
  selectedRows: RosterRow[];
  filters: RosterFilters;
  mode?: "standard" | "groupChatInvite";
  defaultOptionInvites?: Record<string, InviteValues>;
  disabled?: boolean;
}) {
  const router = useRouter();
  const isGroupChatInvite = mode === "groupChatInvite";
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<Scope>(
    isGroupChatInvite ? "all" : "filtered",
  );
  const [template, setTemplate] = useState(
    isGroupChatInvite ? "paid_invite" : "paid_confirm",
  );
  const [courseName, setCourseName] = useState(defaultCourseName);
  const [optionInvites, setOptionInvites] = useState<
    Record<string, InviteValues>
  >(defaultOptionInvites);
  const [testOption, setTestOption] = useState("");
  const [onlyGroupChatNonParticipants, setOnlyGroupChatNonParticipants] =
    useState(isGroupChatInvite);
  const [confirmed, setConfirmed] = useState(false);
  const [sending, setSending] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState("");
  const [inviteLinkSuggestions, setInviteLinkSuggestions] = useState<
    InviteLinkSuggestion[]
  >([]);
  const [suggestionError, setSuggestionError] = useState("");

  const scopeTargets =
    scope === "all" ? rows : scope === "filtered" ? filteredRows : selectedRows;
  const targets = filterGroupChatNonParticipants(
    scopeTargets,
    onlyGroupChatNonParticipants,
  );
  const targetOptionKeys = [
    ...new Set(targets.map((row) => optionKey(row.values.optionName))),
  ];
  const activeTestOption = targetOptionKeys.includes(testOption)
    ? testOption
    : (targetOptionKeys[0] ?? "__no_option");
  const inviteErrors =
    template === "paid_invite"
      ? targetOptionKeys.flatMap((key) =>
          validateInviteValues(
            optionInvites[key] ?? { entryCode: "", linkName: "" },
          ).map((error) => `${optionLabel(key)}: ${error}`),
        )
      : [];
  const testInviteErrors =
    template === "paid_invite"
      ? validateInviteValues(
          optionInvites[activeTestOption] ?? {
            entryCode: "",
            linkName: "",
          },
        )
      : [];
  const testCourseName =
    courseName.trim() ||
    targets.find((row) => optionKey(row.values.optionName) === activeTestOption)
      ?.values.courseName ||
    defaultCourseName.trim();

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();

    async function loadSuggestions() {
      try {
        const response = await fetch(
          `/api/jobs/${jobId}/invite-link-suggestions`,
          { signal: controller.signal },
        );
        const body = await response.json();
        if (!response.ok) {
          throw new Error(body.message ?? "추천 링크를 불러오지 못했습니다.");
        }
        setInviteLinkSuggestions(
          Array.isArray(body.suggestions) ? body.suggestions : [],
        );
        setSuggestionError("");
      } catch (error) {
        if (controller.signal.aborted) return;
        setSuggestionError(
          error instanceof Error
            ? error.message
            : "추천 링크를 불러오지 못했습니다.",
        );
      }
    }

    void loadSuggestions();
    return () => controller.abort();
  }, [jobId, open]);

  function courseNameForOption(key: string) {
    return (
      courseName.trim() ||
      targets.find((row) => optionKey(row.values.optionName) === key)?.values
        .courseName ||
      defaultCourseName.trim()
    );
  }

  function downloadTargetContacts() {
    if (targets.length === 0) return;

    const blob = new Blob([buildTargetContactCsv(targets)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = targetContactCsvFileName(jobName);
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function saveInviteLinkSuggestion(key: string, linkName: string) {
    if (validateInviteValues({ entryCode: "1234", linkName }).length > 0) {
      return;
    }

    try {
      const response = await fetch(
        `/api/jobs/${jobId}/invite-link-suggestions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            courseName: courseNameForOption(key),
            optionName: key,
            linkName,
          }),
        },
      );
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.message ?? "추천 링크를 저장하지 못했습니다.");
      }
      if (body.suggestion) {
        setInviteLinkSuggestions((current) => [body.suggestion, ...current]);
      }
      setSuggestionError("");
    } catch (error) {
      setSuggestionError(
        error instanceof Error
          ? error.message
          : "추천 링크를 저장하지 못했습니다.",
      );
    }
  }

  function updateOptionInvite(
    key: string,
    field: keyof InviteValues,
    value: string,
  ) {
    setOptionInvites((current) => ({
      ...current,
      [key]: {
        entryCode: current[key]?.entryCode ?? "",
        linkName: current[key]?.linkName ?? "",
        [field]: value,
      },
    }));
  }

  async function sendMessages() {
    setSending(true);
    setResult("");
    try {
      const response = await fetch(`/api/jobs/${jobId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope,
          template,
          filters,
          selectedIds: selectedRows.map((row) => row.id),
          onlyGroupChatNonParticipants,
          courseName: testCourseName,
          optionInvites,
        }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.message ?? "발송 요청에 실패했습니다.");
      setConfirmed(false);
      setResult("");
      setOpen(false);
      router.refresh();
    } catch (error) {
      setResult(
        error instanceof Error ? error.message : "발송 요청에 실패했습니다.",
      );
    } finally {
      setSending(false);
    }
  }

  async function sendTestMessage() {
    setTesting(true);
    setResult("");
    try {
      const testInvite = optionInvites[activeTestOption] ?? {
        entryCode: "",
        linkName: "",
      };
      const response = await fetch(`/api/jobs/${jobId}/messages/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template,
          courseName: testCourseName,
          entryCode: testInvite.entryCode,
          linkName: testInvite.linkName,
        }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.message ?? "테스트 발송 요청에 실패했습니다.");
      const status = body.ok ? "테스트 발송 성공" : "테스트 발송 실패";
      const failure = body.ok
        ? ""
        : `${body.reason || "실패 사유를 확인할 수 없습니다."}${body.httpStatus ? ` (HTTP ${body.httpStatus}${body.shoongCode ? ` / ${body.shoongCode}` : ""})` : ""}`;
      setResult(
        [status, `수신자: ${body.recipient}`, failure]
          .filter(Boolean)
          .join("\n"),
      );
    } catch (error) {
      setResult(
        error instanceof Error
          ? error.message
          : "테스트 발송 요청에 실패했습니다.",
      );
    } finally {
      setTesting(false);
    }
  }

  const inviteVariablesMissing = inviteErrors.length > 0;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant={isGroupChatInvite ? "secondary" : "default"}
          disabled={disabled}
          title={
            disabled
              ? "먼저 강의 운영 자동화에서 수강생 명단을 강의에 연결해 주세요."
              : undefined
          }
        >
          <MessageSquareText />
          {isGroupChatInvite
            ? "카톡방 미참여자 알림톡 보내기"
            : "메시지 보내기"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Shoong 알림톡 발송</DialogTitle>
          <DialogDescription>
            대상과 변수를 확인한 뒤 서버에서만 Shoong API를 호출합니다.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>발송 대상</Label>
            <Select
              value={scope}
              onValueChange={(value) => setScope(value as Scope)}
              disabled={isGroupChatInvite}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  전체 유효 인원 ({rows.length}명)
                </SelectItem>
                <SelectItem value="filtered">
                  현재 필터 결과 ({filteredRows.length}명)
                </SelectItem>
                <SelectItem value="selected">
                  선택한 인원 ({selectedRows.length}명)
                  {selectedRows.length === 1 ? " · 단일" : ""}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-start gap-3 rounded-lg border p-3 text-sm">
            <Checkbox
              checked={onlyGroupChatNonParticipants}
              disabled={isGroupChatInvite}
              onCheckedChange={(value) =>
                setOnlyGroupChatNonParticipants(value === true)
              }
            />
            <span>
              <span className="block font-medium">
                단톡방 참여 안한 사람에게만 보내기
              </span>
              <span className="mt-0.5 block text-muted-foreground">
                선택한 발송 범위 {scopeTargets.length.toLocaleString("ko-KR")}명
                중 미참여자 {targets.length.toLocaleString("ko-KR")}명
                {onlyGroupChatNonParticipants ? " · 별도 추가 인원 제외" : ""}
              </span>
            </span>
          </label>
          <div className="grid gap-2">
            <Label>템플릿</Label>
            <Select
              value={template}
              onValueChange={setTemplate}
              disabled={isGroupChatInvite}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="paid_confirm">
                  유료강의 결제 확인 안내
                </SelectItem>
                <SelectItem value="paid_invite">
                  유료강의 결제자 초대
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="course-name">
              공통 강좌명{" "}
              <span className="text-muted-foreground">
                (비우면 행의 강의명)
              </span>
            </Label>
            <Input
              id="course-name"
              value={courseName}
              onChange={(event) => setCourseName(event.target.value)}
            />
          </div>
          {template === "paid_invite" && (
            <div className="grid gap-3">
              <Label>옵션별 초대 정보</Label>
              {targetOptionKeys.map((key) => {
                const values = optionInvites[key] ?? {
                  entryCode: "",
                  linkName: "",
                };
                const recommendedLinks = recommendInviteLinks(
                  inviteLinkSuggestions,
                  courseNameForOption(key),
                  key,
                ).filter(
                  (suggestion) => suggestion.linkName !== values.linkName,
                );
                return (
                  <div key={key} className="grid gap-3 rounded-lg border p-3">
                    <p className="text-sm font-semibold">{optionLabel(key)}</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="grid gap-2">
                        <Label htmlFor={`entry-code-${key}`}>
                          입장코드 (4~6글자)
                        </Label>
                        <Input
                          id={`entry-code-${key}`}
                          value={values.entryCode}
                          onChange={(event) =>
                            updateOptionInvite(
                              key,
                              "entryCode",
                              event.target.value,
                            )
                          }
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor={`link-name-${key}`}>
                          입장 링크 (https://)
                        </Label>
                        <Input
                          id={`link-name-${key}`}
                          type="url"
                          placeholder="https://..."
                          value={values.linkName}
                          onChange={(event) =>
                            updateOptionInvite(
                              key,
                              "linkName",
                              event.target.value,
                            )
                          }
                          onBlur={() =>
                            void saveInviteLinkSuggestion(key, values.linkName)
                          }
                        />
                        {recommendedLinks.length > 0 ? (
                          <div className="grid gap-1.5">
                            <span className="text-xs text-muted-foreground">
                              강의명·옵션명 기준 추천
                            </span>
                            {recommendedLinks.map((suggestion) => (
                              <Button
                                key={`${suggestion.linkName}-${suggestion.usedAt}`}
                                type="button"
                                variant="outline"
                                size="xs"
                                className="h-auto min-w-0 justify-start px-2 py-1.5 text-left font-normal"
                                title={`${suggestion.courseName} · ${optionLabel(suggestion.optionName)}`}
                                onClick={() =>
                                  updateOptionInvite(
                                    key,
                                    "linkName",
                                    suggestion.linkName,
                                  )
                                }
                              >
                                <History className="shrink-0" />
                                <span className="truncate">
                                  {suggestion.linkName}
                                </span>
                              </Button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
              {inviteErrors.length > 0 && (
                <Alert variant="destructive">
                  <AlertTitle>초대 정보를 다시 확인해 주세요.</AlertTitle>
                  <AlertDescription className="whitespace-pre-line">
                    {inviteErrors.join("\n")}
                  </AlertDescription>
                </Alert>
              )}
              {suggestionError ? (
                <p className="text-xs text-destructive">{suggestionError}</p>
              ) : null}
            </div>
          )}
          <div className="rounded-lg border bg-muted/35 p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">
                예상 대상 {targets.length.toLocaleString("ko-KR")}명
              </p>
              {isGroupChatInvite ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={targets.length === 0}
                  onClick={downloadTargetContacts}
                >
                  <Download /> 대상자 CSV 다운로드
                </Button>
              ) : null}
            </div>
            <p className="mt-1 text-muted-foreground">
              샘플:{" "}
              {targets
                .slice(0, 3)
                .map(
                  (row) =>
                    `${row.values.customerName || "이름 없음"} (${formatPhone(row.normalizedPhone)})`,
                )
                .join(", ") || "대상 없음"}
            </p>
          </div>
          <div className="grid gap-3 rounded-lg border border-dashed p-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Badge variant="secondary">테스트 수신자</Badge>
                <p className="mt-1 font-medium">권정인 · 010-2378-7490</p>
              </div>
              <TestTube2 className="size-5 text-muted-foreground" />
            </div>
            {template === "paid_invite" && targetOptionKeys.length > 1 && (
              <div className="grid gap-2">
                <Label>테스트에 적용할 옵션</Label>
                <Select value={activeTestOption} onValueChange={setTestOption}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {targetOptionKeys.map((key) => (
                      <SelectItem key={key} value={key}>
                        {optionLabel(key)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <label className="flex items-start gap-3 text-sm">
            <Checkbox
              checked={confirmed}
              onCheckedChange={(value) => setConfirmed(value === true)}
            />
            <span>
              대상, 템플릿과 변수를 확인했습니다. 최종 발송에 동의합니다.
            </span>
          </label>
          {result && (
            <Alert>
              <Send />
              <AlertTitle>발송 결과</AlertTitle>
              <AlertDescription className="whitespace-pre-line">
                {result}
              </AlertDescription>
            </Alert>
          )}
        </div>
        <DialogFooter className="sm:justify-between">
          <Button
            variant="secondary"
            onClick={sendTestMessage}
            disabled={
              testing ||
              sending ||
              !testCourseName ||
              testInviteErrors.length > 0
            }
          >
            {testing ? <Loader2 className="animate-spin" /> : <TestTube2 />}
            테스트 발송
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              닫기
            </Button>
            <Button
              onClick={sendMessages}
              disabled={
                !confirmed ||
                sending ||
                testing ||
                targets.length === 0 ||
                inviteVariablesMissing
              }
            >
              {sending ? <Loader2 className="animate-spin" /> : <Send />}최종
              발송
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
