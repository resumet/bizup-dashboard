import { z } from "zod";

export const externalMarketingTokenSchema = z.string().regex(/^[a-f0-9]{48}$/u);

const optionalUrl = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => {
    if (!value) return true;
    try {
      const url = new URL(value);
      return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password;
    } catch {
      return false;
    }
  }, "http 또는 https 주소를 입력해 주세요.");

export const landingPageSchema = z.object({
  channel: z.string().trim().min(1, "채널명을 입력해 주세요.").max(80),
  url: optionalUrl.refine(Boolean, "랜딩페이지 주소를 입력해 주세요."),
});

export const externalMarketingInfoSchema = z.object({
  courseName: z.string().trim().max(200),
  instructorName: z.string().trim().max(120),
  affiliateName: z.string().trim().max(120),
  projectManager: z.string().trim().max(120),
  cohort: z.string().trim().max(80),
  webinarDate: z.union([z.iso.date(), z.literal("")]).default(""),
  landingPages: z.array(landingPageSchema).max(20),
  creativeDriveUrl: optionalUrl,
});

export const externalMarketingSettingsSchema = externalMarketingInfoSchema.extend({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "광고 시작일을 확인해 주세요."),
  totalBudget: z.number().int().min(0).max(1_000_000_000_000),
  publicEnabled: z.boolean(),
});

export const externalMarketingPatchSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("public"), enabled: z.boolean() }).strict(),
  z.object({ kind: z.literal("advertising_started"), started: z.boolean() }).strict(),
]);

export const externalMarketingPublicInfoSchema = externalMarketingInfoSchema.extend({
  webinarDate: externalMarketingInfoSchema.shape.webinarDate.removeDefault(),
}).strict();
export type ExternalMarketingPublicInfo = z.infer<typeof externalMarketingPublicInfoSchema>;

export const externalMarketingChatMembersSchema = z.object({
  metricDate: z.iso.date(),
  chatMembersCumulative: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable(),
}).strict();
export type ExternalMarketingChatMembersInput = z.infer<typeof externalMarketingChatMembersSchema>;

export type ExternalMarketingInfo = z.infer<typeof externalMarketingInfoSchema>;
export type ExternalMarketingSettings = z.infer<typeof externalMarketingSettingsSchema>;

export type ExternalMarketingProject = ExternalMarketingInfo & {
  dashboardId: string;
  workspaceId: string;
  publicToken: string;
  publicEnabled: boolean;
  advertisingStarted: boolean;
  updatedAt: string;
  createdAt: string;
};

export type ExternalMarketingProjectSummary = ExternalMarketingProject & {
  startDate: string;
  totalBudget: number;
  spend: number;
  metricCount: number;
  paidLandingLeads: number;
  organicLandingLeads: number;
};
