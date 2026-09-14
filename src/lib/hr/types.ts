export type Employee = { id: string; name: string; department: string; email?: string; role?: "admin" | "employee"; active?: boolean; version?: number; employment_start_date?: string; employment_end_date?: string | null };
export type HrContext = { me: Employee & { role: "admin" | "employee" }; organization: { name: string }; today: string; now: string; unread: number };
export type TaskStatus = "ready" | "doing" | "done" | "cancelled";
export type Task = { transferred_today?: boolean; id: string; task_key: string; task_number: number; title: string; description: string; creator_id: string; creator_name: string; assignee_id: string; assignee_name: string; watcher_ids: string[]; watchers: { id: string; name: string }[]; status: TaskStatus; planned_date: string; version: number; updated_at: string };
export type Attendance = { id: string; work_date: string; check_in_at: string; check_out_at: string | null; version: number; source: string };
export type DaySummary = { employee_id: string; name: string; department: string; date: string; base: string; attendance: Attendance | null; prior_open: Attendance | null; late: boolean; leave_conflict: boolean; long_open: boolean; dwell_minutes: number | null; reference_minutes: number | null; review_version: number; review_submitted_at: string | null; review_late: boolean; review_missing: boolean; pending_correction: boolean; leave_segments: string[]; expected_start: string | null; expected_end: string | null; task_counts?: Record<string, number>; today_task_counts?: Record<string, number>; today_activity?: number; today_transfers?: number };
export type Leave = { id: string; employee_id: string; start_date: string; end_date: string; unit: string; status: string; private_reason: string; version: number; cancellation_reason?: string };
export type LeavePreview = { days: { day: string; segment: string }[]; excluded: string[]; units: number };
export type ReviewItem = { id: string; task_number: number; title: string; status: TaskStatus; version: number; assignee_name: string; work_note: string };
export type Review = { id: string; work_date: string; revision: number; latest_revision: number; note: string; items: ReviewItem[]; late: boolean; submitted_at: string };
export type Correction = { id: string; employee_id: string; work_date: string; requested_in: string; requested_out: string | null; reason: string; status: string; review_reason: string | null };
export type PolicyConfig = { weekdays: number[]; start: number; end: number; breaks: number[][]; split: number; grace: number; holidays: { date: string; name: string }[] };
export type Policy = { id: string; effective_from: string; version: number; config: PolicyConfig };
export const STATUS_LABELS: Record<TaskStatus, string> = { ready: "준비중", doing: "진행중", done: "완료", cancelled: "취소됨" };
export const BASE_LABELS: Record<string, string> = { working: "근무중", checked_out: "퇴근", leave: "휴가", off: "휴무", expected: "출근 예정", unchecked: "미체크", review_needed: "기록 확인 필요" };
export const UNIT_LABELS: Record<string, string> = { full: "종일", am: "오전반차", pm: "오후반차" };
export function formatTime(value: string | null | undefined) { return value ? new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value)) : "—"; }
export function monthRange(month: string) { const [year, number] = month.split("-").map(Number); return { from: `${month}-01`, to: `${month}-${new Date(Date.UTC(year, number, 0)).getUTCDate()}` }; }
