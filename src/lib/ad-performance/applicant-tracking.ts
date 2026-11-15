import { parseMeaningTrackingApplyList } from "@/lib/admin/meaning-tracking";
import { applicantValue, type Applicant } from "@/lib/free-students/model";

export function trackingFromApplicants(rows: readonly Applicant[], todayDate?: string) {
  const values = rows.map(row => {
    if (typeof row.appliedAt !== "string" || Number.isNaN(Date.parse(row.appliedAt))) throw new Error("신청일이 올바르지 않은 신청자가 있습니다. 무료 신청자 명단을 확인해 주세요.");
    return [applicantValue("appliedAt", row.appliedAt), row.inflowPath ?? "", row.mediaChannel ?? ""];
  });
  return parseMeaningTrackingApplyList([["신청일", "유입경로", "진행매체"], ...values], todayDate);
}
