import type { HrLeaveRequest, HrLeaveStatus, HrSupportRecord, HrSupportType, HrSupportUnit } from "./types";

export function annualLeaveDays(employmentStartDate: string, year: number) {
  const [startYear, startMonth] = employmentStartDate.split("-").map(Number);
  if (!startYear || !startMonth || year < startYear) return 0;
  if (year > startYear) return 12;
  return Math.max(0, Math.min(12, 13 - startMonth));
}
export function supportEarnedDays(type: HrSupportType, unit: HrSupportUnit) {
  if (type === "night_webinar") return 0.5;
  return unit === "full" ? 1 : 0.5;
}

export function isActiveStatus(status: HrLeaveStatus) {
  return status === "pending" || status === "approved";
}

export function leaveDaysForUnit(unit: string) {
  return unit === "full" ? 1 : 0.5;
}

export function leaveBalance(
  baseGranted: number,
  requests: Pick<HrLeaveRequest, "days" | "status">[],
  supportRecords: Pick<HrSupportRecord, "earned_days" | "status">[],
) {
  const extraGranted = supportRecords
    .filter((record) => record.status === "approved")
    .reduce((sum, record) => sum + Number(record.earned_days), 0);
  const used = requests
    .filter((request) => request.status === "approved")
    .reduce((sum, request) => sum + Number(request.days), 0);
  const pending = requests
    .filter((request) => request.status === "pending")
    .reduce((sum, request) => sum + Number(request.days), 0);
  return {
    baseGranted,
    extraGranted,
    used,
    pending,
    remaining: baseGranted + extraGranted - used,
    availableToRequest: baseGranted + extraGranted - used - pending,
  };
}
