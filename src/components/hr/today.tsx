"use client";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { BASE_LABELS, UNIT_LABELS, formatTime, type Attendance, type DaySummary, type Leave, type Task } from "@/lib/hr/types";
import { ErrorNotice, Field, Panel, StatusBadge, useHr, useHrList, useHrMutation, useHrQuery } from "./shared";
import { TaskCards, TaskCreateButton, TaskStatusForm } from "./tasks";

export function DayCard({ day }: { day: DaySummary }) {
  return <div className="space-y-3"><p className="text-2xl font-semibold">{BASE_LABELS[day.base]}</p><dl className="grid grid-cols-2 gap-3 text-sm"><div><dt className="text-muted-foreground">출근</dt><dd className="mt-1">{formatTime(day.attendance?.check_in_at)}</dd></div><div><dt className="text-muted-foreground">퇴근</dt><dd className="mt-1">{formatTime(day.attendance?.check_out_at)}</dd></div><div><dt className="text-muted-foreground">참고 근무시간</dt><dd className="mt-1">{day.reference_minutes == null ? "—" : `${Math.floor(day.reference_minutes / 60)}시간 ${day.reference_minutes % 60}분`}</dd></div><div><dt className="text-muted-foreground">오늘 업무정리</dt><dd className="mt-1">{day.review_version ? `제출완료 · ${day.review_version}차${day.review_late ? " · 사후 작성" : ""}` : "미정리"}</dd></div></dl>
    <div className="flex flex-wrap gap-2 text-xs text-amber-800">{day.late && <span>지각</span>}{day.leave_segments.map(segment => <span key={segment}>{UNIT_LABELS[segment]}</span>)}{day.leave_conflict && <span>휴가·근태 겹침 확인</span>}{day.pending_correction && <span>정정 검토 중</span>}{day.long_open && <span>장시간 미종료 · 정정 필요</span>}</div>
  </div>;
}

export function ReviewComposer({ workDate, tasks, version, attendance, reload, done, past = false }: { workDate: string; tasks: Task[]; version: number; attendance?: Attendance | null; reload: () => void; done: () => void; past?: boolean }) {
  const [note, setNote] = useState(""); const [selected, setSelected] = useState<string[]>(tasks.map(task => task.id)); const [savedVersion, setSavedVersion] = useState<number>();
  const review = useHrMutation(); const checkout = useHrMutation(); const [savedMessage, setSavedMessage] = useState("");
  async function save(withCheckout: boolean) {
    try {
      const result = await review.mutate<{ revision: number }>("review.submit", { work_date: workDate, expected_version: savedVersion ?? version, note, items: tasks.filter(task => selected.includes(task.id)).map(task => ({ id: task.id, expected_version: task.version })) });
      setSavedVersion(result.revision); setSavedMessage("업무정리를 저장했습니다.");
      if (withCheckout && attendance && !attendance.check_out_at) {
        try { await checkout.mutate("attendance.out", { id: attendance.id, expected_version: attendance.version }); done(); }
        catch { setSavedMessage("업무정리는 저장되었습니다. 퇴근만 다시 시도해 주세요."); }
      } else { done(); }
    } catch { /* Checkout remains independent from review errors. */ }
  }
  async function outOnly() { if (!attendance) return; try { await checkout.mutate("attendance.out", { id: attendance.id, expected_version: attendance.version }); done(); } catch {} }
  return <div className="space-y-4"><p className="text-sm text-muted-foreground">{workDate} · {past ? "현재 조회 가능한 업무를 선택하고 해당 날짜에 수행한 내용을 메모로 남겨주세요. 과거 업무 상태를 변경하지 않습니다." : "미완료 업무는 진행중·준비중 그대로 정리할 수 있습니다."}</p>
    <div className="max-h-[35dvh] space-y-3 overflow-y-auto rounded-lg border p-3">{tasks.length ? tasks.map(task => <div key={task.id} className="rounded-lg bg-slate-50 p-3"><label className="flex min-h-10 items-center gap-3 text-sm"><input type="checkbox" checked={selected.includes(task.id)} onChange={e => setSelected(e.target.checked ? [...selected,task.id] : selected.filter(id => id !== task.id))} /><span className="min-w-0 flex-1 break-words">{task.title}</span><StatusBadge status={task.status} /></label>{!past && <details className="mt-2"><summary className="cursor-pointer text-xs text-blue-700">상태 확인·변경</summary><div className="mt-3"><TaskStatusForm task={task} key={task.version} saved={reload} /></div></details>}</div>) : <p className="text-sm">오늘 등록된 업무 없음 · 빈 목록으로 정리할 수 있습니다.</p>}</div>
    <Field label="일일 메모 (선택)"><Textarea value={note} onChange={e => setNote(e.target.value)} maxLength={3000} rows={4} placeholder="오늘 수행한 일, 막힌 점, 다음 근무일 할 일" /></Field>
    {savedMessage && <p role="status" className="text-sm text-emerald-800">{savedMessage}</p>}<ErrorNotice error={review.error} retry={reload} /><ErrorNotice error={checkout.error} />
    <div className="flex flex-wrap gap-2"><Button disabled={review.busy || checkout.busy} onClick={() => void save(Boolean(attendance && !attendance.check_out_at))}>{attendance && !attendance.check_out_at ? "정리 저장 후 퇴근" : "정리 저장"}</Button>{attendance && !attendance.check_out_at && <Button variant="outline" disabled={checkout.busy} onClick={() => void outOnly()}>{savedVersion ? "퇴근만 다시 시도" : "정리는 나중에 하고 퇴근"}</Button>}</div>
  </div>;
}

type TodayData = { summary: DaySummary; tasks: Task[]; total: number; upcoming_leaves: Leave[]; today: string; now: string };
function CheckoutReview({ attendance, done }: { attendance?: Attendance | null; done: () => void }) {
  const { today } = useHr(); const date = attendance?.work_date ?? today; const past = date < today;
  const day = useHrQuery<TodayData>("today", { date });
  const tasks = useHrList<Task>(past ? "tasks" : "today", past ? { scope: "all", status: "all" } : { date });
  return <><ErrorNotice error={day.error || tasks.error} retry={() => { day.reload(); tasks.reload(); }} />{day.data && tasks.items ? <ReviewComposer workDate={date} version={day.data.summary.review_version} tasks={tasks.items} attendance={attendance} past={past} reload={() => { day.reload(); tasks.reload(); }} done={done} /> : <><p role="status">정리할 업무를 불러오는 중…</p>{attendance && !attendance.check_out_at && <CheckoutOnly attendance={attendance} done={done} />}</>}</>;
}
function CheckoutOnly({ attendance, done }: { attendance: Attendance; done: () => void }) {
  const mutation = useHrMutation();
  return <><ErrorNotice error={mutation.error} /><Button variant="outline" disabled={mutation.busy} onClick={async () => { try { await mutation.mutate("attendance.out", { id: attendance.id, expected_version: attendance.version }); done(); } catch {} }}>정리는 나중에 하고 퇴근</Button></>;
}
export function TodayPage() {
  const { me, today } = useHr(); const data = useHrQuery<TodayData>("today", { date: today, limit: 100 }); const [open, setOpen] = useState(false); const mutation = useHrMutation();
  const summary = data.data?.summary; const attendance = summary?.prior_open ?? summary?.attendance;
  return <><div><p className="text-sm text-muted-foreground">{today} · Asia/Seoul</p><h1 className="mt-2 text-2xl font-semibold">{me.name}님의 오늘</h1></div><ErrorNotice error={data.error} retry={data.reload} />
    <div className="grid gap-5 lg:grid-cols-[360px_1fr]"><div className="space-y-5"><Panel title="출퇴근">{summary ? <><DayCard day={summary} />
      {summary.prior_open && <p className="mt-4 text-sm text-amber-800">전일 {summary.prior_open.work_date} 출근 기록의 퇴근 처리입니다.</p>}
      <div className="mt-6">{summary.long_open ? <Button asChild className="w-full"><Link href="/hr/records">근태 정정 요청</Link></Button> : attendance && !attendance.check_out_at ? <Button className="h-12 w-full" onClick={() => setOpen(true)}>퇴근하기</Button> : !summary.attendance ? <Button className="h-12 w-full" disabled={mutation.busy} onClick={async () => { try { await mutation.mutate("attendance.in", {}); data.reload(); } catch {} }}>출근하기</Button> : <Button variant="outline" className="w-full" onClick={() => setOpen(true)}>오늘 업무정리</Button>}</div><ErrorNotice error={mutation.error} /></> : <p role="status">근태를 불러오는 중…</p>}</Panel>
      <Panel title="예정 휴가" actions={<Link className="text-sm text-emerald-800" href="/hr/leaves">휴가 등록</Link>}><ul className="space-y-3 text-sm">{data.data?.upcoming_leaves.length ? data.data.upcoming_leaves.map(leave => <li key={leave.id}>{leave.start_date} ~ {leave.end_date}<span className="ml-2 text-muted-foreground">{UNIT_LABELS[leave.unit]}</span></li>) : <li className="text-muted-foreground">예정된 휴가가 없습니다.</li>}</ul></Panel>
    </div><Panel title="오늘 내 업무" actions={<TaskCreateButton saved={data.reload} />}><TaskCards tasks={data.data?.tasks.filter(task => !task.transferred_today) ?? []} statusSaved={data.reload} />{data.data?.tasks.some(task => task.transferred_today) && <div className="mt-5 border-t pt-5"><h3 className="font-semibold">오늘 이관한 업무</h3><TaskCards tasks={data.data.tasks.filter(task => task.transferred_today)} /></div>}{(data.data?.total ?? 0) > 100 && <Link href="/hr/tasks" className="text-sm underline">전체 {data.data?.total}개 업무 보기</Link>}<Button variant="outline" className="mt-5" onClick={() => setOpen(true)}>오늘 업무정리</Button></Panel></div>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{attendance && !attendance.check_out_at ? "퇴근 전 업무정리" : "오늘 업무정리"}</DialogTitle><DialogDescription>정리와 퇴근 기록은 각각 저장됩니다.</DialogDescription></DialogHeader>{open && summary && <CheckoutReview attendance={attendance} done={() => { setOpen(false); data.reload(); }} />}</DialogContent></Dialog>
  </>;
}
