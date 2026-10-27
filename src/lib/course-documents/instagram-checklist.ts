import { z } from "zod";

export const DEFAULT_INSTAGRAM_CHECKLIST_ITEMS = [
  { id: "kim-suna-login", title: "김선아님 로그인 했는지", completed: false },
  { id: "shin-yeyoung-blue-badge", title: "신예영님 블루뱃지 받았는지", completed: false },
  { id: "shin-yeyoung-video", title: "신예영님 영상 올라온거 확인됐는지", completed: false },
  { id: "shin-yeyoung-filming-date", title: "신예영님 촬영 일자 확정했는지", completed: false },
] as const;

export const instagramChecklistItemSchema = z.object({
  id: z.string().trim().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/),
  title: z.string().trim().min(1, "할 일을 입력해 주세요.").max(200, "할 일은 200자까지 입력할 수 있습니다."),
  completed: z.boolean(),
});

export const instagramChecklistItemsSchema = z.array(instagramChecklistItemSchema)
  .max(30, "할 일은 최대 30개까지 설정할 수 있습니다.")
  .superRefine((items, context) => {
    if (new Set(items.map((item) => item.id)).size !== items.length) {
      context.addIssue({ code: "custom", message: "중복된 할 일 식별자가 있습니다." });
    }
  });

export type InstagramChecklistItem = z.infer<typeof instagramChecklistItemSchema>;

export function defaultInstagramChecklistItems(): InstagramChecklistItem[] {
  return DEFAULT_INSTAGRAM_CHECKLIST_ITEMS.map((item) => ({ ...item }));
}
