"use client";

import { refundDate } from "@/lib/jobs/refund";
import { RefundedRoster } from "@/components/jobs/refunded-roster";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  Download,
  ExternalLink,
  History,
  Loader2,
  MessageSquareText,
  Search,
  Send,
  TestTube2,
} from "lucide-react";

import { RosterUpdateDialog } from "@/components/jobs/roster-update-dialog";
import { PaymentIdButton } from "@/components/jobs/payment-id-button";
import { CourseRosterShareDialog } from "@/components/course-operations/course-roster-share-dialog";
import { useRosterInvites } from "./use-roster-invites";
import { PaidRosterColumnOptions, usePaidRosterColumns, type PaidRosterColumn } from "@/components/jobs/paid-roster-column-options";
import { rosterRecipient } from "@/lib/jobs/linked-student";
import { resolveRosterMessageTargets } from "@/lib/messages/roster-recipients";
import { RosterAnalysisCards } from "@/components/jobs/roster-analysis-cards";
import { PaidRosterSummaryCards } from "@/components/jobs/paid-roster-summary-cards";
import { DeleteSelectedEnrollmentsButton } from "@/components/jobs/delete-selected-enrollments-button";
import { EnrollmentMemoInput } from "@/components/jobs/enrollment-memo-input";
import { ManualEnrollmentDialog } from "@/components/jobs/manual-enrollment-dialog";
import { ManualEnrollmentName } from "@/components/jobs/manual-enrollment-name";
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
  isOpenableInviteLink,
  optionKey,
  optionLabel,
  validateInviteValues,
  type InviteValues,
} from "@/lib/messages/invite";
import {
  MESSAGE_SCOPE_LABELS,
  MESSAGE_TEMPLATE_LABELS,
  type MessageHistoryItem,
} from "@/lib/messages/types";
import { rosterSourceId } from "@/lib/messages/recipient-source";
import { summarizePaidRoster } from "@/lib/jobs/paid-roster-summary";
import {
  rosterSelectionStorageKey,
  serializeRosterSelection,
} from "@/lib/messages/roster-selection-transfer";

type Props = {
  paidRoster?: boolean;
  courseId?: string;
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
  paidRoster = false,
  courseId,
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
  const { hiddenColumns, setHiddenColumns } = usePaidRosterColumns(currentUserId);
  const showColumn = (column: PaidRosterColumn) => !paidRoster || !hiddenColumns.includes(column);
  const [allRows, setRows] = useState(initialRows);
  const rows = useMemo(() => allRows.filter((row) => !refundDate(row.values)), [allRows]);
  const refundedRows = useMemo(() => allRows.filter((row) => refundDate(row.values)), [allRows]);
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
  const paidRosterSummary = useMemo(() => summarizePaidRoster(rows), [rows]);
  const selectedRows = sortedRows.filter((row) => selected.has(row.id));
  const allFilteredSelected =
    filteredRows.length > 0 &&
    filteredRows.every((row) => selected.has(row.id));
  const messageIdsToSync = messageHistory
    .filter(
      (message) =>
        !message.isTest &&
        message.provider === "directalk" &&
        (message.status === "processing" || !message.deliveryCheckedAt),
    )
    .map((message) => message.id);
  const messageIdsToSyncKey = messageIdsToSync.join(",");
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
    if (!messageIdsToSyncKey) return;
    const messageIds = messageIdsToSyncKey.split(",").filter(Boolean);
    let syncing = false;
    const sync = async () => {
      if (syncing) return;
      syncing = true;
      try {
        await Promise.allSettled(
          messageIds.map((messageId) =>
            fetch(`/api/jobs/${jobId}/messages/${messageId}/sync`, {
              method: "POST",
            }),
          ),
        );
        router.refresh();
      } finally {
        syncing = false;
      }
    };
    const timer = window.setInterval(sync, 5_000);
    return () => window.clearInterval(timer);
  }, [jobId, messageIdsToSyncKey, router]);

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

  function openGeneralMessageAutomation() {
    if (selectedRows.length === 0) return;
    if (selectedRows.length > 1_000) {
      window.alert("한 번에 최대 1,000명까지 선택 발송할 수 있습니다.");
      return;
    }
    const sourceId = rosterSourceId(jobId);
    const selectionKey = crypto.randomUUID();
    sessionStorage.setItem(
      rosterSelectionStorageKey(selectionKey),
      serializeRosterSelection(
        sourceId,
        selectedRows.map((row) => row.id),
        resolveRosterMessageTargets(selectedRows).map((row) => ({
          id: row.id,
          name: row.values.customerName,
          phone: row.normalizedPhone,
        })),
      ),
    );
    router.push(
      `/services/message-automation?bookId=${encodeURIComponent(sourceId)}&selectionKey=${encodeURIComponent(selectionKey)}`,
    );
  }

  if (loadError)
    return (
      <Alert variant="destructive">
        <AlertTitle>상세 명단을 불러오지 못했습니다.</AlertTitle>
        <AlertDescription>{loadError}</AlertDescription>
      </Alert>
    );
  if (allRows.length === 0 && !paidRoster)
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
            {paidRoster ? "유료수강생" : <>{jobName}{courseName ? ` (${courseName})` : ""}</>}
          </h1>
          <p className="mt-2 text-muted-foreground">
            최신 명단을 조회하고 필터링하거나 메시지를 발송할 수 있습니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 lg:max-w-[62%] lg:justify-end">
          {paidRoster && courseId && <CourseRosterShareDialog courseId={courseId} />}
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
            disabled={!hasLinkedCourse || rows.length === 0}
          />
          <MessageDialog
            jobId={jobId}
            jobName={jobName}
            defaultCourseName={defaultCourseName}
            rows={sortedRows}
            filteredRows={filteredRows}
            selectedRows={selectedRows}
            filters={filters}
            defaultOptionInvites={linkedOptionInvites}
            disabled={rows.length === 0}
          />
          <Button
            type="button"
            variant="outline"
            disabled={selectedRows.length === 0}
            onClick={openGeneralMessageAutomation}
          >
            <Send />
            일반 메시지 보내기
          </Button>
        </div>
      </div>
      {paidRoster ? <PaidRosterSummaryCards summary={paidRosterSummary} /> : null}
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
                placeholder={paidRoster ? "이름·전화·이메일·RS·비고" : "이름·전화·이메일·추천인·비고"}
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
              placeholder={paidRoster ? "전체 RS" : "전체 유입 경로"}
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
            {paidRoster && <PaidRosterColumnOptions hiddenColumns={hiddenColumns} onChange={setHiddenColumns} />}
            <RosterUpdateDialog jobId={jobId} label={paidRoster ? "수강생 엑셀로 추가" : undefined} />
            <ManualEnrollmentDialog
              jobId={jobId}
              courseName={courseName}
              paidRoster={paidRoster}
              onAdded={(row) => setRows((current) => [...current, row])}
            />
            <DeleteSelectedEnrollmentsButton
              jobId={jobId}
              selectedIds={selectedRows.map((row) => row.id)}
            />
            <div className="flex items-center gap-2">
              <Label htmlFor={`${jobId}-roster-sort`} className="shrink-0 text-sm text-muted-foreground">
                목록 정렬
              </Label>
              <Select
                value={sort}
                onValueChange={(value) => setSort(value as RosterSort)}
              >
                <SelectTrigger id={`${jobId}-roster-sort`} className="w-48" aria-label={paidRoster ? "유료수강생 목록 정렬" : "수강생 이름 정렬"}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="original">{paidRoster ? "등록된 순서 (기본)" : "원래 목록순"}</SelectItem>
                  <SelectItem value="nameAsc">{paidRoster ? "가나다순 (가→하)" : "이름 오름차순"}</SelectItem>
                  <SelectItem value="nameDesc">{paidRoster ? "가나다 역순 (하→가)" : "이름 내림차순"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="outline"
              onClick={() => setSort("original")}
              disabled={sort === "original"}
            >
              {paidRoster ? "처음 순서로" : "원래 목록대로"}
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
          <Table aria-label={paidRoster ? "유료수강생 명단" : "수강생 명단"}>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    aria-label="필터 결과 전체 선택"
                    checked={allFilteredSelected}
                    onCheckedChange={(value) => toggleFiltered(value === true)}
                  />
                </TableHead>
                {showColumn("customerName") && <TableHead>{paidRoster ? "결제자" : "고객명"}</TableHead>}
                {showColumn("groupChat") && <TableHead className="whitespace-nowrap text-center">
                  단톡방 참여
                </TableHead>}
                {showColumn("extraParticipant") && <TableHead className="whitespace-nowrap text-center">
                  별도 추가 인원
                </TableHead>}
                {showColumn("phone") && <TableHead>{paidRoster ? "결제자 연락처" : "연락처"}</TableHead>}
                {paidRoster && showColumn("recipient") && <TableHead>수신 수강생</TableHead>}
                {showColumn("email") && <TableHead>이메일</TableHead>}
                {showColumn("optionName") && <TableHead>옵션명</TableHead>}
                {paidRoster ? <>
                  {showColumn("paymentMethod") && <TableHead>결제방법</TableHead>}
                  {showColumn("rs") && <TableHead>RS</TableHead>}
                  {showColumn("paymentId") && <TableHead>결제ID</TableHead>}
                  {showColumn("paymentAmount") && <TableHead className="text-right">결제금액</TableHead>}
                </> : <><TableHead>추천인</TableHead><TableHead>유입 경로</TableHead><TableHead>광고 매체</TableHead></>}
                {showColumn("memo") && <TableHead>비고</TableHead>}
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
                  {showColumn("customerName") && <TableCell className="font-medium">
                    <ManualEnrollmentName
                      paidRoster={paidRoster}
                      jobId={jobId}
                      enrollmentId={row.id}
                      normalizedPhone={row.normalizedPhone}
                      values={row.values}
                      onSaved={(enrollment) =>
                        setRows((current) =>
                          current.map((item) =>
                            item.id === row.id
                              ? {
                                  ...item,
                                  normalizedPhone: enrollment.normalizedPhone,
                                  values: enrollment.values,
                                }
                              : item,
                          ),
                        )
                      }
                    />
                    {row.isDuplicate && (
                      <Badge variant="secondary" className="ml-2">
                        중복
                      </Badge>
                    )}
                  </TableCell>}
                  {showColumn("groupChat") && <TableCell>
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
                  </TableCell>}
                  {showColumn("extraParticipant") && <TableCell>
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
                  </TableCell>}
                  {showColumn("phone") && <TableCell className="font-mono text-sm">
                    {formatPhone(row.normalizedPhone)}
                  </TableCell>}
                  {paidRoster && showColumn("recipient") && <TableCell className="min-w-40">
                    {row.values.hasDifferentStudent ? <div className="space-y-1">
                      <Badge variant="secondary">수강생 연결</Badge>
                      <p className="font-medium">{rosterRecipient(row).name || "이름 확인 필요"}</p>
                      <p className="whitespace-nowrap font-mono text-xs">{formatPhone(rosterRecipient(row).phone) || "전화번호 확인 필요"}</p>
                    </div> : <span className="text-sm text-muted-foreground">결제자 본인</span>}
                  </TableCell>}
                  {showColumn("email") && <TableCell>{row.values.email || "-"}</TableCell>}
                  {showColumn("optionName") && <TableCell>{row.values.optionName || "-"}</TableCell>}
                  {paidRoster ? <>
                    {showColumn("paymentMethod") && <TableCell>{row.values.paymentMethod || "—"}</TableCell>}
                    {showColumn("rs") && <TableCell>{row.values.rs || row.values.source || "—"}</TableCell>}
                    {showColumn("paymentId") && <TableCell><PaymentIdButton value={row.values.paymentId} name={row.values.customerName} /></TableCell>}
                    {showColumn("paymentAmount") && <TableCell className="text-right tabular-nums">{row.values.paymentAmount ? `${Number(row.values.paymentAmount).toLocaleString("ko-KR")}원` : "—"}</TableCell>}
                  </> : <><TableCell>{row.values.referrer || "-"}</TableCell><TableCell>{row.values.source || "-"}</TableCell><TableCell>{row.values.adMedia || "-"}</TableCell></>}
                  {showColumn("memo") && <TableCell>
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
                  </TableCell>}
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
      <RefundedRoster rows={refundedRows} />
      <RosterAnalysisCards
        sourceLabel={paidRoster ? "RS" : undefined}
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
                  <TableHead className="text-right">실제 성공</TableHead>
                  <TableHead className="text-right">실제 실패</TableHead>
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

export function MessageDialog({
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
  sendEndpoint,
  selectedOnly = false,
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
  sendEndpoint?: string;
  selectedOnly?: boolean;
}) {
  const router = useRouter();
  const isGroupChatInvite = mode === "groupChatInvite";
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<Scope>(
    selectedOnly ? "selected" : isGroupChatInvite ? "all" : "filtered",
  );
  const [template, setTemplate] = useState(
    isGroupChatInvite ? "paid_invite" : "paid_confirm",
  );
  const [courseName, setCourseName] = useState(defaultCourseName);
  const invites = useRosterInvites(jobId, defaultOptionInvites);
  const { optionInvites } = invites;
  const [testOption, setTestOption] = useState("");
  const [onlyGroupChatNonParticipants, setOnlyGroupChatNonParticipants] =
    useState(isGroupChatInvite);
  const [confirmed, setConfirmed] = useState(false);
  const [sending, setSending] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState("");

  const scopeTargets =
    scope === "all" ? rows : scope === "filtered" ? filteredRows : selectedRows;
  const targets = resolveRosterMessageTargets(filterGroupChatNonParticipants(
    scopeTargets,
    onlyGroupChatNonParticipants,
  ));
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

  function updateOptionInvite(
    key: string,
    field: keyof InviteValues,
    value: string,
  ) {
    invites.update(key, field, value);
  }

  async function changeOpen(nextOpen: boolean) {
    if (nextOpen) {
      setOpen(true);
      void invites.load();
    } else if (!sending && !testing) {
      // Close also flushes edits made immediately before Escape or clicking outside.
      if (!invites.loaded || await invites.save()) setOpen(false);
    }
  }

  async function sendMessages() {
    setSending(true);
    setResult("");
    try {
      if (template === "paid_invite" && !await invites.save()) return;
      const response = await fetch(
        sendEndpoint ?? `/api/jobs/${jobId}/messages`,
        {
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
        },
      );
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
      if (template === "paid_invite" && !await invites.save()) return;
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
    <Dialog open={open} onOpenChange={(value) => void changeOpen(value)}>
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
            ? "카톡방 미참여 알림톡"
            : "결제자 안내하기"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>알림톡 발송</DialogTitle>
          <DialogDescription>
            발송 대상을 확인해 주세요. 입장정보는 이 명단에 저장되어 다음에도 불러옵니다.
          </DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 gap-4 overflow-y-auto overscroll-contain py-4 pr-2">
          <div className="grid gap-2">
            <Label>발송 대상</Label>
            <Select
              value={scope}
              onValueChange={(value) => setScope(value as Scope)}
              disabled={isGroupChatInvite || selectedOnly}
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
            <fieldset disabled={!invites.loaded} className="grid min-w-0 gap-3">
              <Label>옵션별 초대 정보</Label>
              {invites.loading && <p role="status" className="text-sm text-muted-foreground">저장된 입장정보를 불러오는 중입니다.</p>}
              {targetOptionKeys.map((key) => {
                const values = optionInvites[key] ?? {
                  entryCode: "",
                  linkName: "",
                };
                const savedLinkMissing = values.linkName && !invites.links.some(link => link.url === values.linkName);
                const canOpenLink = isOpenableInviteLink(values.linkName);
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
                          maxLength={100}
                          onBlur={() => void invites.save()}
                          onChange={(event) =>
                            updateOptionInvite(
                              key,
                              "entryCode",
                              event.target.value,
                            )
                          }
                        />
                      </div>
                      <div className="grid min-w-0 gap-2">
                        <Label htmlFor={`link-name-${key}`}>입장 링크</Label>
                        <div className="flex min-w-0 items-center gap-2">
                          <Select
                            value={values.linkName}
                            disabled={!invites.loaded}
                            onValueChange={(value) => {
                              updateOptionInvite(key, "linkName", value);
                              void invites.save();
                            }}
                          >
                            <SelectTrigger id={`link-name-${key}`} className="min-w-0 flex-1">
                              <SelectValue placeholder="강의 링크 선택">{values.linkName ? invites.links.find(link => link.url === values.linkName)?.label ?? "저장된 링크 (강의 목록에 없음)" : undefined}</SelectValue>
                            </SelectTrigger>
                            <SelectContent position="popper" className="max-w-[calc(100vw-3rem)] sm:max-w-md">
                              {invites.links.map(link => (
                                <SelectItem key={link.url} value={link.url} disabled={!isOpenableInviteLink(link.url)} textValue={link.label}>
                                  <span className="grid min-w-0 gap-1">
                                    <span className="whitespace-normal break-words font-medium">{link.label}{!isOpenableInviteLink(link.url) ? " (HTTPS 필요)" : ""}</span>
                                    <span className="break-all whitespace-normal text-xs text-muted-foreground">{link.url}</span>
                                  </span>
                                </SelectItem>
                              ))}
                              {savedLinkMissing && <SelectItem value={values.linkName} textValue="저장된 링크 (강의 목록에 없음)">저장된 링크 (강의 목록에 없음)</SelectItem>}
                              {!invites.links.length && !savedLinkMissing && <SelectItem value="__no_course_links" disabled>등록된 강의 링크가 없습니다.</SelectItem>}
                            </SelectContent>
                          </Select>
                          {canOpenLink ? (
                            <Button variant="outline" className="shrink-0" asChild>
                              <a href={values.linkName.trim()} target="_blank" rel="noopener noreferrer" aria-label={`${optionLabel(key)} 입장 링크 열어보기`}>
                                <ExternalLink />열어보기
                              </a>
                            </Button>
                          ) : (
                            <Button type="button" variant="outline" className="shrink-0" disabled aria-label={`${optionLabel(key)} 입장 링크 열어보기`}>
                              <ExternalLink />열어보기
                            </Button>
                          )}
                        </div>
                        {values.linkName && <p className="break-all text-xs text-muted-foreground">선택된 링크: {values.linkName}</p>}
                        <p className="text-xs text-muted-foreground">
                          {invites.links.length ? "선택하면 이 명단에 자동 저장됩니다." : "연결된 강의의 링크 관리에 링크를 등록해 주세요."}
                          {invites.courseId && <> <Link href={`/services/course-operations/${invites.courseId}`} target="_blank" rel="noreferrer" className="underline underline-offset-2">강의 링크 관리</Link></>}
                        </p>
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
            </fieldset>
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
          <details className="rounded-lg border border-dashed p-3 text-sm">
            <summary className="cursor-pointer font-medium">테스트 발송 설정</summary>
            <div className="mt-3 grid gap-3">
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
          </details>
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
        <DialogFooter className="flex-col bg-background sm:flex-col">
          {(invites.error || invites.status || invites.saving) && <p role={invites.error ? "alert" : "status"} className={`text-xs ${invites.error ? "text-destructive" : "text-muted-foreground"}`}>{invites.error || (invites.saving ? "입장정보 저장 중…" : invites.status)}</p>}
          <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
          {template === "paid_invite" && <Button variant="outline" disabled={!invites.loaded || invites.saving} onClick={() => void invites.save()}>입장정보 저장</Button>}
          <Button
            variant="secondary"
            onClick={sendTestMessage}
            disabled={
              testing ||
              sending ||
              (template === "paid_invite" && !invites.loaded) ||
              !testCourseName ||
              testInviteErrors.length > 0
            }
          >
            {testing ? <Loader2 className="animate-spin" /> : <TestTube2 />}
            테스트 발송
          </Button>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" disabled={sending || testing} onClick={() => void changeOpen(false)}>
              닫기
            </Button>
            <Button
              onClick={sendMessages}
              disabled={
                !confirmed ||
                sending ||
                testing ||
                (template === "paid_invite" && !invites.loaded) ||
                targets.length === 0 ||
                inviteVariablesMissing
              }
            >
              {sending ? <Loader2 className="animate-spin" /> : <Send />}최종
              발송
            </Button>
          </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
