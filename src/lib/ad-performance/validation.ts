import { z } from "zod";

export const dateValue = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).refine((value) => {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "날짜 형식이 올바르지 않습니다.");

const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

export const metricSchema = z.object({
  metricDate: dateValue,
  googleImpressions: count,
  metaImpressions: count,
  googleClicks: count,
  metaClicks: count,
  googleAdLeads: count,
  metaAdLeads: count,
  googleSpend: count,
  metaSpend: count,
  googleLandingLeads: count,
  metaLandingLeads: count,
  adminCumulativeLeads: count,
  chatRoomMembers: count.nullable().optional(),
  organicLeads: z.record(z.uuid(), count),
});

export const organicChannelNameSchema = z.string().trim().min(1, "오가닉 채널명을 입력해 주세요.").max(80, "오가닉 채널명은 80자 이하여야 합니다.");

export const createDashboardSchema = z.object({
  courseId: z.uuid(),
  startDate: dateValue,
  totalBudget: count,
});

export const updateDashboardSchema = z.object({
  startDate: dateValue,
  totalBudget: count,
  metrics: z.array(metricSchema).max(1_000),
}).superRefine((value, context) => {
  const dates = new Set<string>();
  value.metrics.forEach((metric, index) => {
    if (dates.has(metric.metricDate)) {
      context.addIssue({ code: "custom", path: ["metrics", index, "metricDate"], message: "같은 날짜를 두 번 입력할 수 없습니다." });
    }
    dates.add(metric.metricDate);
    if (metric.metricDate < value.startDate) {
      context.addIssue({ code: "custom", path: ["metrics", index, "metricDate"], message: "광고 시작일 이전 데이터는 저장할 수 없습니다." });
    }
  });
});

export function adPerformanceErrorResponse(error: unknown) {
  if (error instanceof z.ZodError) {
    return Response.json({ message: error.issues[0]?.message ?? "입력값을 확인해 주세요." }, { status: 400 });
  }
  const message = error instanceof Error ? error.message : "광고성과 요청을 처리하지 못했습니다.";
  const status = message === "UNAUTHORIZED" ? 401 : message === "NOT_FOUND" ? 404 : 400;
  const publicMessage = message === "UNAUTHORIZED" ? "로그인이 필요합니다." : message === "NOT_FOUND" ? "광고성과 대시보드를 찾을 수 없습니다." : message;
  return Response.json({ message: publicMessage }, { status });
}
