import { z } from "zod";

export const typeKeySchema = z.string().regex(/^[a-z][a-z0-9_]{0,63}$/);
export const shortLinkInputSchema = z.object({
  course_id: z.string().uuid(),
  type_key: typeKeySchema,
  destination_url: z.string().trim().url().max(2000).refine(value => {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
  }),
  name: z.string().trim().min(1).max(120),
}).strict();

export const shortLinkTypesSchema = z.object({ types: z.array(z.object({
  key: typeKeySchema, label: z.string().min(1).max(120), active: z.boolean(),
})) }).refine(({ types }) => new Set(types.map(item => item.key)).size === types.length);

export const shortLinkResultSchema = z.object({
  short_url: z.string().url().refine(value => {
    const url = new URL(value);
    return url.origin === "https://bizup.im" && !url.username && !url.password;
  }),
  existing: z.boolean(),
});
export type ShortLinkInput = z.input<typeof shortLinkInputSchema>;

export const chatLinkRequest = shortLinkInputSchema.pick({ course_id: true, destination_url: true }).extend({
  field: z.enum(["freeKakaoRoom1ShortLink", "freeKakaoRoom2ShortLink"]),
});
export type ChatLinkRequest = z.input<typeof chatLinkRequest>;

export const replayLinkRequest = z.object({
  course_id: z.uuid(), purpose: z.literal("replay-guide"),
}).strict();
