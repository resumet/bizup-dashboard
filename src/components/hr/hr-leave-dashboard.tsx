"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarCheck2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Gift,
  Loader2,
  Moon,
  Plus,
  ShieldCheck,
  Sun,
  Trash2,
  Umbrella,
  X,
} from "lucide-react";

import { annualLeaveDays } from "@/lib/hr-leave/policy";
import type {
  HrLeaveDashboardData,
  HrLeaveRequest,
  HrLeaveStatus,
  HrLeaveUnit,
  HrSupportRecord,
  HrSupportType,
  HrSupportUnit,
} from "@/lib/hr-leave/types";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

const WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"];
const STATUS_LABELS: Record<HrLeaveStatus, string> = {
  pending: "승인 대기",
  approved: "승인",
  rejected: "반려",
  cancelled: "취소",
};
const UNIT_LABELS: Record<HrLeaveUnit, string> = {
  full: "종일",
  am: "오전 반차",
  pm: "오후 반차",
};

function statusVariant(status: HrLeaveStatus) {
  if (status === "approved") return "default" as const;
  if (status === "pending") return "secondary" as const;
  if (status === "rejected") return "destructive" as const;
  return "outline" as const;
}

function days(value: number) {
  return `${Number(value).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}개`;
}

function dateKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function calendarDates(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const first = new Date(Date.UTC(year, monthNumber - 1, 1));
  first.setUTCDate(first.getUTCDate() - ((first.getUTCDay() + 6) % 7));
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(first);
    date.setUTCDate(first.getUTCDate() + index);
    return dateKey(date);
  });
}

function shiftMonth(month: string, amount: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + amount, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthTitle(month: string) {
  const [year, monthNumber] = month.split("-");
  return `${year}년 ${Number(monthNumber)}월`;
}

function supportLabel(record: Pick<HrSupportRecord, "support_type" | "unit">) {
  if (record.support_type === "night_webinar") return "야간 웨비나 지원";
  return `주말·휴일 지원 (${record.unit === "full" ? "종일" : "반나절"})`;
}

async function readJson(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message ?? "요청을 처리하지 못했습니다.");
  return body;
}

export function HrLeaveDashboard({ initialData }: { initialData: HrLeaveDashboardData }) {
  const router = useRouter();
  const me = initialData.people.find((person) => person.id === initialData.userId);
  const peopleById = useMemo(() => new Map(initialData.people.map((person) => [person.id, person])), [initialData.people]);
  const [requestOpen, setRequestOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [leaveDate, setLeaveDate] = useState(initialData.today);
  const [leaveUnit, setLeaveUnit] = useState<HrLeaveUnit>("full");
  const [leaveReason, setLeaveReason] = useState("");
  const [supportDate, setSupportDate] = useState(initialData.today);
  const [supportType, setSupportType] = useState<HrSupportType>("night_webinar");
  const [supportUnit, setSupportUnit] = useState<HrSupportUnit>("half");
  const [supportNote, setSupportNote] = useState("");
  const [profileDates, setProfileDates] = useState<Record<string, string>>(() => Object.fromEntries(initialData.people.map((person) => [person.id, person.employmentStartDate])));
  const [calendarMonth, setCalendarMonth] = useState(() => initialData.year === Number(initialData.today.slice(0, 4)) ? initialData.today.slice(0, 7) : `${initialData.year}-01`);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const myRequests = initialData.requests.filter((request) => request.user_id === initialData.userId);
  const mySupports = initialData.supportRecords.filter((record) => record.user_id === initialData.userId);
  const requestsByDate = useMemo(() => {
    const map = new Map<string, HrLeaveRequest[]>();
    for (const request of initialData.requests) {
      if (request.status === "cancelled" || request.status === "rejected") continue;
      map.set(request.leave_date, [...(map.get(request.leave_date) ?? []), request]);
    }
    return map;
  }, [initialData.requests]);
  const calendarDays = useMemo(() => calendarDates(calendarMonth), [calendarMonth]);
  const pendingRequests = initialData.requests.filter((request) => request.status === "pending");
  const pendingSupports = initialData.supportRecords.filter((record) => record.status === "pending");
  const currentYear = Number(initialData.today.slice(0, 4));
  const isCurrentYear = initialData.year === currentYear;

  async function mutate(payload: Record<string, unknown>, method: "POST" | "PATCH", key: string, success: string) {
    if (busy) return false;
    setBusy(key);
    setError("");
    setNotice("");
    try {
      await readJson(await fetch("/api/hr/leave", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }));
      setNotice(success);
      router.refresh();
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "휴가 정보를 저장하지 못했습니다.");
      return false;
    } finally {
      setBusy("");
    }
  }

  async function submitLeave(event: FormEvent) {
    event.preventDefault();
    const saved = await mutate({ action: "request", leaveDate, unit: leaveUnit, reason: leaveReason }, "POST", "request", "휴가 신청을 등록했습니다.");
    if (saved) {
      setRequestOpen(false);
      setLeaveReason("");
    }
  }

  async function submitSupport(event: FormEvent) {
    event.preventDefault();
    const saved = await mutate({ action: "support", supportDate, supportType, unit: supportType === "night_webinar" ? "half" : supportUnit, note: supportNote }, "POST", "support", "지원근무 기록을 등록했습니다.");
    if (saved) {
      setSupportOpen(false);
      setSupportNote("");
    }
  }

  async function resetYear() {
    const reset = await mutate(
      { action: "reset_year", year: initialData.year },
      "PATCH",
      "reset-year",
      `${initialData.year}년 전체 휴가 정보를 리셋했습니다.`,
    );
    if (reset) setResetOpen(false);
  }

  return <div className="mx-auto max-w-[1600px] space-y-6 px-5 py-8 lg:px-8 lg:py-10">
    <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
      <div><Badge variant="outline">매년 1월 1일 초기화</Badge><h1 className="mt-3 text-3xl font-semibold tracking-tight">근태관리</h1><p className="mt-2 text-muted-foreground">기본 휴가와 지원근무로 적립한 추가휴가를 분리해 기록합니다.</p></div>
      <div className="flex flex-wrap items-center gap-2">
        {initialData.year > currentYear - 5 ? <Button variant="outline" asChild><Link href={`/hr/leave?year=${initialData.year - 1}`}><ChevronLeft />{initialData.year - 1}년</Link></Button> : <Button variant="outline" disabled><ChevronLeft />이전 연도</Button>}
        <Badge variant="secondary" className="h-9 px-4 text-sm">{initialData.year}년</Badge>
        {initialData.year < currentYear + 1 ? <Button variant="outline" asChild><Link href={`/hr/leave?year=${initialData.year + 1}`}>{initialData.year + 1}년<ChevronRight /></Link></Button> : <Button variant="outline" disabled>다음 연도<ChevronRight /></Button>}
        {initialData.isAdmin ? <Button variant="destructive" onClick={() => setResetOpen(true)}><Trash2 />전체 휴가 리셋</Button> : null}
        {isCurrentYear ? <><Button variant="outline" onClick={() => { setError(""); setSupportOpen(true); }}><Moon />지원근무 기록</Button><Button onClick={() => { setError(""); setRequestOpen(true); }}><Plus />휴가 신청</Button></> : null}
      </div>
    </div>

    {error ? <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
    {notice ? <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p> : null}

    <section aria-label="내 휴가 요약" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {[
        { label: "기본 부여", value: me?.baseGranted ?? 0, icon: CalendarCheck2, tone: "bg-blue-50 text-blue-700" },
        { label: "추가휴가", value: me?.extraGranted ?? 0, icon: Gift, tone: "bg-violet-50 text-violet-700" },
        { label: "사용 완료", value: me?.used ?? 0, icon: Umbrella, tone: "bg-emerald-50 text-emerald-700" },
        { label: "승인 대기", value: me?.pending ?? 0, icon: Clock3, tone: "bg-amber-50 text-amber-700" },
        { label: "현재 잔여", value: me?.remaining ?? 0, icon: Sun, tone: "bg-sky-50 text-sky-700" },
      ].map((item) => <Card key={item.label}><CardContent className="flex items-center justify-between p-5"><div><p className="text-sm text-muted-foreground">{item.label}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{days(item.value)}</p></div><span className={`rounded-xl p-3 ${item.tone}`}><item.icon className="size-5" /></span></CardContent></Card>)}
    </section>

    {!me?.baseGranted ? <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{initialData.year}년 기본 휴가가 아직 부여되지 않았습니다. 관리자에게 입사일 확인과 연간 휴가 부여를 요청해 주세요.</p> : null}

    <Tabs defaultValue="my-leave" className="gap-4">
      <TabsList><TabsTrigger value="my-leave"><Umbrella />내 휴가</TabsTrigger><TabsTrigger value="my-support"><Gift />내 추가휴가</TabsTrigger>{initialData.isAdmin ? <><TabsTrigger value="admin-table"><ShieldCheck />직원 현황</TabsTrigger><TabsTrigger value="admin-calendar"><CalendarDays />휴가 달력</TabsTrigger></> : null}</TabsList>

      <TabsContent value="my-leave"><Card><CardHeader><CardTitle>내 휴가 신청 기록</CardTitle></CardHeader><CardContent className="p-0"><LeaveRequestTable requests={myRequests} peopleById={peopleById} busy={busy} showPerson={false} onCancel={(id) => void mutate({ action: "cancel_request", id }, "PATCH", id, "휴가 신청을 취소했습니다.")} /></CardContent></Card></TabsContent>

      <TabsContent value="my-support"><Card><CardHeader><CardTitle>지원근무·추가휴가 원장</CardTitle><p className="text-sm text-muted-foreground">승인된 지원근무만 추가휴가 잔여량에 반영됩니다.</p></CardHeader><CardContent className="p-0"><SupportTable records={mySupports} peopleById={peopleById} busy={busy} showPerson={false} onCancel={(id) => void mutate({ action: "cancel_support", id }, "PATCH", id, "지원근무 기록을 취소했습니다.")} /></CardContent></Card></TabsContent>

      {initialData.isAdmin ? <TabsContent value="admin-table" className="space-y-5">
        <Card><CardHeader><CardTitle>{initialData.year}년 직원별 휴가 현황</CardTitle><p className="text-sm text-muted-foreground">입사월도 1개월로 포함해 연말까지 월 1개를 부여합니다.</p></CardHeader><CardContent className="overflow-x-auto p-0"><Table><TableHeader><TableRow><TableHead className="pl-5">직원</TableHead><TableHead>입사일</TableHead><TableHead>기본</TableHead><TableHead>추가</TableHead><TableHead>사용</TableHead><TableHead>대기</TableHead><TableHead>잔여</TableHead><TableHead className="pr-5 text-right">관리</TableHead></TableRow></TableHeader><TableBody>{initialData.people.map((person) => { const date = profileDates[person.id] ?? person.employmentStartDate; const recommended = annualLeaveDays(date, initialData.year); return <TableRow key={person.id}><TableCell className="pl-5 font-medium">{person.name}{person.id === initialData.userId ? <Badge variant="outline" className="ml-2">나</Badge> : null}</TableCell><TableCell><Input type="date" value={date} className="w-40" onChange={(event) => setProfileDates((current) => ({ ...current, [person.id]: event.target.value }))} /></TableCell><TableCell>{days(person.baseGranted)}</TableCell><TableCell className="text-violet-700">{days(person.extraGranted)}</TableCell><TableCell>{days(person.used)}</TableCell><TableCell>{days(person.pending)}</TableCell><TableCell className="font-semibold">{days(person.remaining)}</TableCell><TableCell className="pr-5 text-right"><Button size="sm" variant={person.baseGranted === recommended && person.profileSaved ? "outline" : "default"} disabled={!date || busy === `grant-${person.id}`} onClick={() => void mutate({ action: "grant", userId: person.id, employmentStartDate: date, year: initialData.year }, "POST", `grant-${person.id}`, `${person.name}님의 ${initialData.year}년 기본 휴가 ${recommended}개를 부여했습니다.`)}>{busy === `grant-${person.id}` ? <Loader2 className="animate-spin" /> : <Gift />}{person.baseGranted ? "다시 계산" : `${recommended}개 부여`}</Button></TableCell></TableRow>; })}</TableBody></Table></CardContent></Card>

        <div className="grid gap-5 2xl:grid-cols-2">
          <Card><CardHeader><CardTitle>승인 대기 휴가</CardTitle></CardHeader><CardContent className="p-0"><LeaveRequestTable requests={pendingRequests} peopleById={peopleById} busy={busy} showPerson onReview={(id, status) => void mutate({ action: "review_request", id, status }, "PATCH", id, status === "approved" ? "휴가를 승인했습니다." : "휴가를 반려했습니다.")} /></CardContent></Card>
          <Card><CardHeader><CardTitle>승인 대기 추가휴가</CardTitle></CardHeader><CardContent className="p-0"><SupportTable records={pendingSupports} peopleById={peopleById} busy={busy} showPerson onReview={(id, status) => void mutate({ action: "review_support", id, status }, "PATCH", id, status === "approved" ? "추가휴가를 승인했습니다." : "지원근무 기록을 반려했습니다.")} /></CardContent></Card>
        </div>
      </TabsContent> : null}

      {initialData.isAdmin ? <TabsContent value="admin-calendar"><Card><CardHeader className="flex flex-row items-center justify-between gap-3"><div><CardTitle>{monthTitle(calendarMonth)} 휴가 달력</CardTitle><p className="mt-1 text-sm text-muted-foreground">승인 및 승인 대기 휴가를 직원별로 표시합니다.</p></div><div className="flex gap-1"><Button size="icon-sm" variant="outline" aria-label="이전 달" disabled={calendarMonth === `${initialData.year}-01`} onClick={() => setCalendarMonth((current) => shiftMonth(current, -1))}><ChevronLeft /></Button><Button size="icon-sm" variant="outline" aria-label="다음 달" disabled={calendarMonth === `${initialData.year}-12`} onClick={() => setCalendarMonth((current) => shiftMonth(current, 1))}><ChevronRight /></Button></div></CardHeader><CardContent className="overflow-x-auto"><div className="min-w-[900px] overflow-hidden rounded-xl border"><div className="grid grid-cols-7 bg-muted/40">{WEEKDAYS.map((day) => <div key={day} className="border-b px-2 py-2 text-center text-sm font-semibold">{day}</div>)}</div><div className="grid grid-cols-7">{calendarDays.map((day, index) => { const inMonth = day.startsWith(calendarMonth); const entries = requestsByDate.get(day) ?? []; return <div key={day} className={`min-h-32 border-r border-b p-1.5 [&:nth-child(7n)]:border-r-0 [&:nth-last-child(-n+7)]:border-b-0 ${inMonth ? "bg-background" : "bg-muted/20"}`}><div className={`mb-1 px-1 text-sm font-medium ${inMonth ? "" : "text-muted-foreground/50"}`}>{Number(day.slice(-2))}</div><div className="space-y-1">{entries.map((entry) => <div key={entry.id} className={`rounded-md border px-2 py-1.5 text-xs ${entry.status === "approved" ? "border-emerald-200 bg-emerald-50 text-emerald-950" : "border-amber-200 bg-amber-50 text-amber-950"}`}><div className="truncate font-semibold">{peopleById.get(entry.user_id)?.name ?? "직원"}</div><div>{UNIT_LABELS[entry.unit]} · {entry.status === "approved" ? "승인" : "대기"}</div></div>)}</div>{!entries.length && index < 0 ? null : null}</div>; })}</div></div></CardContent></Card></TabsContent> : null}
    </Tabs>

    <Dialog open={requestOpen} onOpenChange={(open) => { if (!busy) setRequestOpen(open); }}><DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>휴가 신청</DialogTitle><DialogDescription>승인 대기 신청도 신청 가능 잔여량에서 미리 차감됩니다.</DialogDescription></DialogHeader><form className="grid gap-4" onSubmit={(event) => void submitLeave(event)}><div className="grid gap-2"><Label htmlFor="leave-date">휴가 날짜</Label><Input id="leave-date" type="date" min={initialData.today} max={`${initialData.year}-12-31`} value={leaveDate} onChange={(event) => setLeaveDate(event.target.value)} /></div><div className="grid gap-2"><Label>사용 단위</Label><Select value={leaveUnit} onValueChange={(value) => setLeaveUnit(value as HrLeaveUnit)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="full">종일 · 1개</SelectItem><SelectItem value="am">오전 반차 · 0.5개</SelectItem><SelectItem value="pm">오후 반차 · 0.5개</SelectItem></SelectContent></Select></div><div className="grid gap-2"><Label htmlFor="leave-reason">메모</Label><Textarea id="leave-reason" maxLength={1000} value={leaveReason} onChange={(event) => setLeaveReason(event.target.value)} placeholder="선택 입력" /></div><DialogFooter><DialogClose asChild><Button type="button" variant="outline">취소</Button></DialogClose><Button type="submit" disabled={!leaveDate || busy === "request"}>{busy === "request" ? <Loader2 className="animate-spin" /> : <Umbrella />}신청</Button></DialogFooter></form></DialogContent></Dialog>

    <Dialog open={supportOpen} onOpenChange={(open) => { if (!busy) setSupportOpen(open); }}><DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>지원근무 기록</DialogTitle><DialogDescription>관리자 승인 후 기존 기본 휴가와 별도의 추가휴가로 적립됩니다.</DialogDescription></DialogHeader><form className="grid gap-4" onSubmit={(event) => void submitSupport(event)}><div className="grid gap-2"><Label htmlFor="support-date">지원 날짜</Label><Input id="support-date" type="date" min={`${initialData.year}-01-01`} max={initialData.today} value={supportDate} onChange={(event) => setSupportDate(event.target.value)} /></div><div className="grid gap-2"><Label>지원 종류</Label><Select value={supportType} onValueChange={(value) => { const type = value as HrSupportType; setSupportType(type); if (type === "night_webinar") setSupportUnit("half"); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="night_webinar">야간 웨비나 지원 · 0.5개</SelectItem><SelectItem value="weekend_holiday">주말·휴일 지원</SelectItem></SelectContent></Select></div>{supportType === "weekend_holiday" ? <div className="grid gap-2"><Label>지원 시간</Label><Select value={supportUnit} onValueChange={(value) => setSupportUnit(value as HrSupportUnit)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="half">반나절 · 0.5개</SelectItem><SelectItem value="full">종일 · 1개</SelectItem></SelectContent></Select></div> : null}<div className="grid gap-2"><Label htmlFor="support-note">업무 메모</Label><Textarea id="support-note" maxLength={1000} value={supportNote} onChange={(event) => setSupportNote(event.target.value)} placeholder="지원한 웨비나나 업무를 적어 주세요" /></div><DialogFooter><DialogClose asChild><Button type="button" variant="outline">취소</Button></DialogClose><Button type="submit" disabled={!supportDate || busy === "support"}>{busy === "support" ? <Loader2 className="animate-spin" /> : <Moon />}기록</Button></DialogFooter></form></DialogContent></Dialog>

    <AlertDialog open={resetOpen} onOpenChange={(open) => { if (busy !== "reset-year") setResetOpen(open); }}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>{initialData.year}년 전체 휴가 정보를 리셋할까요?</AlertDialogTitle><AlertDialogDescription>모든 직원의 {initialData.year}년 기본휴가 부여, 휴가 신청, 추가휴가 기록이 영구 삭제됩니다. 직원별 입사일은 유지되며 이 작업은 되돌릴 수 없습니다.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel disabled={busy === "reset-year"}>취소</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={busy === "reset-year"} onClick={(event) => { event.preventDefault(); void resetYear(); }}>{busy === "reset-year" ? <Loader2 className="animate-spin" /> : <Trash2 />}{busy === "reset-year" ? "리셋 중…" : `${initialData.year}년 전체 리셋`}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}

function LeaveRequestTable({ requests, peopleById, busy, showPerson, onCancel, onReview }: {
  requests: HrLeaveRequest[];
  peopleById: Map<string, HrLeaveDashboardData["people"][number]>;
  busy: string;
  showPerson: boolean;
  onCancel?: (id: string) => void;
  onReview?: (id: string, status: "approved" | "rejected") => void;
}) {
  return <div className="overflow-x-auto"><Table><TableHeader><TableRow>{showPerson ? <TableHead className="pl-5">직원</TableHead> : null}<TableHead className={showPerson ? "" : "pl-5"}>날짜</TableHead><TableHead>단위</TableHead><TableHead>메모</TableHead><TableHead>상태</TableHead><TableHead className="pr-5 text-right">작업</TableHead></TableRow></TableHeader><TableBody>{requests.map((request) => <TableRow key={request.id}>{showPerson ? <TableCell className="pl-5 font-medium">{peopleById.get(request.user_id)?.name ?? "직원"}</TableCell> : null}<TableCell className={showPerson ? "tabular-nums" : "pl-5 tabular-nums"}>{request.leave_date}</TableCell><TableCell>{UNIT_LABELS[request.unit]} · {days(request.days)}</TableCell><TableCell className="max-w-64 whitespace-normal text-muted-foreground">{request.reason || "-"}</TableCell><TableCell><Badge variant={statusVariant(request.status)}>{STATUS_LABELS[request.status]}</Badge></TableCell><TableCell className="pr-5 text-right">{onReview && request.status === "pending" ? <span className="inline-flex gap-1"><Button size="xs" disabled={busy === request.id} onClick={() => onReview(request.id, "approved")}><CalendarCheck2 />승인</Button><Button size="xs" variant="outline" disabled={busy === request.id} onClick={() => onReview(request.id, "rejected")}><X />반려</Button></span> : onCancel && request.status === "pending" ? <Button size="xs" variant="ghost" disabled={busy === request.id} onClick={() => onCancel(request.id)}><X />취소</Button> : "-"}</TableCell></TableRow>)}{!requests.length ? <TableRow><TableCell colSpan={showPerson ? 6 : 5} className="h-28 text-center text-muted-foreground">휴가 신청 기록이 없습니다.</TableCell></TableRow> : null}</TableBody></Table></div>;
}

function SupportTable({ records, peopleById, busy, showPerson, onCancel, onReview }: {
  records: HrSupportRecord[];
  peopleById: Map<string, HrLeaveDashboardData["people"][number]>;
  busy: string;
  showPerson: boolean;
  onCancel?: (id: string) => void;
  onReview?: (id: string, status: "approved" | "rejected") => void;
}) {
  return <div className="overflow-x-auto"><Table><TableHeader><TableRow>{showPerson ? <TableHead className="pl-5">직원</TableHead> : null}<TableHead className={showPerson ? "" : "pl-5"}>지원일</TableHead><TableHead>지원 종류</TableHead><TableHead>추가휴가</TableHead><TableHead>메모</TableHead><TableHead>상태</TableHead><TableHead className="pr-5 text-right">작업</TableHead></TableRow></TableHeader><TableBody>{records.map((record) => <TableRow key={record.id}>{showPerson ? <TableCell className="pl-5 font-medium">{peopleById.get(record.user_id)?.name ?? "직원"}</TableCell> : null}<TableCell className={showPerson ? "tabular-nums" : "pl-5 tabular-nums"}>{record.support_date}</TableCell><TableCell>{supportLabel(record)}</TableCell><TableCell className="font-medium text-violet-700">+{days(record.earned_days)}</TableCell><TableCell className="max-w-64 whitespace-normal text-muted-foreground">{record.note || "-"}</TableCell><TableCell><Badge variant={statusVariant(record.status)}>{STATUS_LABELS[record.status]}</Badge></TableCell><TableCell className="pr-5 text-right">{onReview && record.status === "pending" ? <span className="inline-flex gap-1"><Button size="xs" disabled={busy === record.id} onClick={() => onReview(record.id, "approved")}><Gift />승인</Button><Button size="xs" variant="outline" disabled={busy === record.id} onClick={() => onReview(record.id, "rejected")}><X />반려</Button></span> : onCancel && record.status === "pending" ? <Button size="xs" variant="ghost" disabled={busy === record.id} onClick={() => onCancel(record.id)}><X />취소</Button> : "-"}</TableCell></TableRow>)}{!records.length ? <TableRow><TableCell colSpan={showPerson ? 7 : 6} className="h-28 text-center text-muted-foreground">지원근무 기록이 없습니다.</TableCell></TableRow> : null}</TableBody></Table></div>;
}
