import { z } from "zod";

import {
  requireCourseOperationsMembership,
  requireCourseOperationsUser,
} from "@/lib/course-operations/server";
import { createClient } from "@/lib/supabase/server";
import { generateYoutubeTitleFormula } from "@/lib/tools/youtube-title-formula";

export const runtime = "nodejs";
export const maxDuration = 120;

const requestSchema = z.object({
  channelTitle: z.string().trim().min(1).max(200),
  videos: z
    .array(
      z.object({
        id: z.string().min(1).max(30),
        title: z.string().trim().min(1).max(500),
        publishedAt: z.string().max(50),
        views: z.number().int().nonnegative(),
        likes: z.number().int().nonnegative().nullable(),
        comments: z.number().int().nonnegative().nullable(),
      }),
    )
    .min(3)
    .max(30),
});

export async function POST(request: Request) {
  try {
    const user = await requireCourseOperationsUser(await createClient());
    await requireCourseOperationsMembership(user.id);
    const body = requestSchema.parse(await request.json());
    const formula = await generateYoutubeTitleFormula({ ...body, userId: user.id });
    return Response.json({ formula });
  } catch (error) {
    const unauthorized = error instanceof Error && error.message === "UNAUTHORIZED";
    console.error("[youtube-title-formula]", { unauthorized, error });
    const message = unauthorized
      ? "로그인이 필요합니다."
      : error instanceof z.ZodError
        ? "영상 분석 요청이 올바르지 않습니다."
        : error instanceof Error
          ? error.message
          : "제목 공식을 만들지 못했습니다.";
    return Response.json({ error: message }, { status: unauthorized ? 401 : 400 });
  }
}
