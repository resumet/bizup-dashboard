import { z } from "zod";

export const DEFAULT_INSTAGRAM_CHECKLIST_TEMPLATE_ITEMS = [
  { id: "account-login", title: "계정 로그인 완료했는지" },
  { id: "blue-badge", title: "블루뱃지 받았나요?" },
  { id: "instructor-video-upload", title: "강사님이 영상 업로드해주신 것 확인했나요?" },
  { id: "filming-date-1", title: "강사님 1차 촬영 일자 확정했나요?" },
  { id: "filming-date-2", title: "강사님 2차 촬영 일자 확정했나요?" },
  { id: "filming-date-3", title: "강사님 3차 촬영 일자 확정했나요?" },
  { id: "filming-date-4", title: "강사님 4차 촬영 일자 확정했나요?" },
] as const;

export const instagramChecklistItemIdSchema = z.string().trim().min(1).max(80).regex(
  /^[a-zA-Z0-9_-]+$/,
  "할 일 식별자를 확인해 주세요.",
);

export const instagramChecklistTemplateItemSchema = z.object({
  id: instagramChecklistItemIdSchema,
  title: z.string().trim().min(1, "할 일을 입력해 주세요.").max(200, "할 일은 200자까지 입력할 수 있습니다."),
});

export const instagramChecklistTemplateItemsSchema = z.array(instagramChecklistTemplateItemSchema)
  .max(30, "할 일은 최대 30개까지 설정할 수 있습니다.")
  .superRefine((items, context) => {
    if (new Set(items.map((item) => item.id)).size !== items.length) {
      context.addIssue({ code: "custom", message: "중복된 할 일 식별자가 있습니다." });
    }
  });

export const instagramChecklistCompletedItemIdsSchema = z.array(instagramChecklistItemIdSchema)
  .max(30, "완료한 할 일은 최대 30개까지 저장할 수 있습니다.")
  .superRefine((ids, context) => {
    if (new Set(ids).size !== ids.length) {
      context.addIssue({ code: "custom", message: "중복된 완료 항목이 있습니다." });
    }
  });

export type InstagramChecklistTemplateItem = z.infer<typeof instagramChecklistTemplateItemSchema>;
export type InstagramChecklistItem = InstagramChecklistTemplateItem & { completed: boolean };

export function defaultInstagramChecklistTemplateItems(): InstagramChecklistTemplateItem[] {
  return DEFAULT_INSTAGRAM_CHECKLIST_TEMPLATE_ITEMS.map((item) => ({ ...item }));
}

export function mergeInstagramChecklistState(
  templateItems: InstagramChecklistTemplateItem[],
  completedItemIds: string[],
): InstagramChecklistItem[] {
  const completed = new Set(completedItemIds);
  return templateItems.map((item) => ({ ...item, completed: completed.has(item.id) }));
}
