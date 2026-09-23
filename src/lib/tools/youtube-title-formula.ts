import "server-only";

import { openai } from "@ai-sdk/openai";
import { APICallError, generateText, Output } from "ai";
import { z } from "zod";

import {
  topVideoGroups,
  type YoutubeTitleFormula,
  type Video,
} from "@/lib/youtube-analyzer/model";

export const YOUTUBE_TITLE_MODEL =
  process.env.OPENAI_COPY_MODEL || process.env.OPENAI_MODEL || "gpt-4.1-mini";

const formulaSchema = z.object({
  summary: z.string().min(1),
  signals: z.array(z.string().min(1)).min(2).max(6),
  formulas: z
    .array(
      z.object({
        name: z.string().min(1),
        template: z.string().min(1),
        whyItWorks: z.string().min(1),
        example: z.string().min(1),
      }),
    )
    .min(3)
    .max(5),
  cautions: z.array(z.string().min(1)).max(4),
});

export async function generateYoutubeTitleFormula({
  channelTitle,
  videos,
  userId,
}: {
  channelTitle: string;
  videos: Video[];
  userId: string;
}) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      "OpenAI API 인증이 없습니다. OPENAI_API_KEY를 서버 환경 변수에 설정해 주세요.",
    );
  }
  if (videos.length < 3) {
    throw new Error("제목 공식을 만들려면 공개 영상이 3개 이상 필요합니다.");
  }

  const groups = topVideoGroups(videos);
  const compact = (video: Video) => ({
    title: video.title,
    publishedAt: video.publishedAt,
    views: video.views,
    likes: video.likes,
    comments: video.comments,
  });

  try {
    const result = await generateText({
      model: openai(YOUTUBE_TITLE_MODEL),
      output: Output.object({
        schema: formulaSchema,
        name: "youtube_hook_title_formula",
        description: "최근 고성과 영상에서 도출한 재사용 가능한 한국어 제목 공식",
      }),
      system: [
        "당신은 한국어 유튜브 콘텐츠 전략가입니다.",
        "최근 영상 중 조회수, 좋아요, 댓글이 높은 영상의 제목을 각각 비교해 반복되는 후킹 구조만 도출하세요.",
        "성과가 높은 이유를 제목만으로 확정하지 말고, 데이터에서 확인되는 상관관계라고 표현하세요.",
        "공식은 [대상], [문제], [숫자], [결과], [기간]처럼 바꿔 쓸 수 있는 대괄호 변수로 작성하세요.",
        "원제목을 그대로 복제하거나 사실을 과장하는 낚시성 문구를 권하지 마세요.",
        "예시는 해당 채널의 주제와 말투에 맞춘 새로운 제목으로 작성하세요.",
        "응답은 모두 자연스러운 한국어로 작성하세요.",
      ].join("\n"),
      prompt: JSON.stringify({
        channelTitle,
        sampleSize: videos.length,
        topByViews: groups.views.map(compact),
        topByLikes: groups.likes.map(compact),
        topByComments: groups.comments.map(compact),
      }),
      providerOptions: { openai: { user: userId, store: false } },
    });
    return result.output satisfies YoutubeTitleFormula;
  } catch (error) {
    if (APICallError.isInstance(error)) {
      if (error.statusCode === 401) throw new Error("OpenAI API 키가 올바르지 않습니다.");
      if (error.statusCode === 429) {
        throw new Error("AI 요청이 많습니다. 잠시 후 다시 시도해 주세요.");
      }
      throw new Error(
        `제목 공식 생성에 실패했습니다. (HTTP ${error.statusCode ?? "unknown"})`,
      );
    }
    throw error;
  }
}
