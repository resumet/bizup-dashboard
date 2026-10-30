import { isDateKey } from "@/lib/shared-calendar/calendar";
import type { HrLeaveUnit } from "@/lib/hr-leave/types";

export type DashboardLeaveStatus = "today" | "upcoming" | "pending";

export type DashboardLeave = {
  id: string;
  name: string;
  unit: string;
  leaveDate: string;
  status: DashboardLeaveStatus;
  href: string;
};

export type DashboardLeaveRequest = {
  id: string;
  user_id: string;
  leave_date: string;
  unit: HrLeaveUnit;
  status: string;
};

export type DashboardLeavePerson = {
  id: string;
  name: string;
  active: boolean;
};

const UNIT_LABELS: Record<HrLeaveUnit, string> = {
  full: "종일 휴가",
  am: "오전 반차",
  pm: "오후 반차",
};

export function shiftDashboardDate(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function dashboardLeaveItems(
  requests: DashboardLeaveRequest[],
  people: DashboardLeavePerson[],
  today: string,
): DashboardLeave[] {
  const until = shiftDashboardDate(today, 7);
  const activePeople = new Map(people.filter((person) => person.active).map((person) => [person.id, person.name]));

  return requests.flatMap((request) => {
    const name = activePeople.get(request.user_id);
    if (
      !name
      || !isDateKey(request.leave_date)
      || request.leave_date < today
      || request.leave_date > until
      || !Object.hasOwn(UNIT_LABELS, request.unit)
      || (request.status !== "approved" && request.status !== "pending")
    ) return [];

    return [{
      id: request.id,
      name,
      unit: UNIT_LABELS[request.unit],
      leaveDate: request.leave_date,
      status: request.status === "pending" ? "pending" as const : request.leave_date === today ? "today" as const : "upcoming" as const,
      href: `/hr/leave?year=${request.leave_date.slice(0, 4)}`,
    }];
  }).sort((left, right) => left.leaveDate.localeCompare(right.leaveDate)
    || (left.status === "pending" ? 1 : 0) - (right.status === "pending" ? 1 : 0)
    || left.name.localeCompare(right.name, "ko"));
}
