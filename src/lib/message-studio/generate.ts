import "server-only";

import { openai } from "@ai-sdk/openai";
import { APICallError, generateText, Output } from "ai";
import { z } from "zod";

import type {
  MessageStudioDraft,
  MessageStudioResource,
} from "@/lib/message-studio/types";
import {
  enforceMessageLinkPolicy,
  validateMessageLinks,
} from "@/lib/message-studio/link-policy";

export const MESSAGE_STUDIO_MODEL = process.env.OPENAI_MODEL || "gpt-5.6-terra";

type GenerateMessagesInput = {
  project: MessageStudioDraft;
  resources: MessageStudioResource[];
  positions: number[];
  userId: string;
};

export async function generateCourseMessages({
  project,
  resources,
  positions,
  userId,
}: GenerateMessagesInput) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      "OpenAI API 인증이 없습니다. OPENAI_API_KEY를 .env.local에 설정해 주세요.",
    );
  }

  const sourceByPosition = new Map(
    resources.map((resource) => [
      resource.position,
      resource.example_text.trim(),
    ]),
  );
  const missingPositions = positions.filter(
    (position) => !sourceByPosition.get(position),
  );
  if (missingPositions.length > 0) {
    throw new Error(
      `기존 리소스를 먼저 입력해 주세요: ${missingPositions.map((value) => `${value}번`).join(", ")}`,
    );
  }

  const linkErrors = validateMessageLinks(positions, project);
  if (linkErrors.length > 0) {
    throw new Error(linkErrors.join("\n"));
  }

  const schema = z.object({
    messages: z
      .array(
        z.object({
          position: z.number().int().min(1).max(30),
          message: z.string().min(1),
        }),
      )
      .length(positions.length),
  });

  try {
    const result = await generateText({
      model: openai(MESSAGE_STUDIO_MODEL),
      output: Output.object({
        schema,
        name: "course_marketing_messages",
        description: "요청한 번호별 한국어 강의 마케팅 문자",
      }),
      system: [
        "당신은 한국어 강의 마케팅 문자 전문 카피라이터입니다.",
        "기존 문자의 목적, 발송 시점, 분위기, 줄바꿈과 이모지 사용 방식을 분석하되 문장을 복제하지 마세요.",
        "각 결과는 해당 번호의 기존 문자와 같은 역할을 수행해야 합니다.",
        "예시 문자 안의 URL은 절대 복사하지 말고 links 객체에 입력된 URL만 정확히 사용하세요.",
        "1번부터 29번까지는 본문 끝에 결제 링크(payment)만 한 번 넣고 다른 종류의 링크는 절대 넣지 마세요.",
        "30번은 링크 안내 문구나 URL을 생성하지 말고 링크 블록 직전까지의 본문만 생성하세요. 서버가 정해진 링크 블록을 그대로 추가합니다.",
        "존재하지 않는 할인, 날짜, 가격, 혜택은 만들지 마세요.",
        "문자는 바로 복사해 발송할 수 있는 완성본이어야 합니다.",
        "반드시 요청받은 position을 각각 한 번씩 포함하세요.",
      ].join("\n"),
      prompt: JSON.stringify(
        {
          course: {
            name: project.course_name,
            instructor: project.instructor_name,
            features: project.course_features,
            targetAudience: project.target_audience,
          },
          links: {
            payment: project.payment_link,
            inquiry: project.inquiry_link,
            curriculum: project.curriculum_link,
            replay: project.replay_link,
          },
          requestedPositions: positions,
          linkPolicy: {
            positions1To29: "결제 링크만 사용",
            position30: "링크 블록은 서버에서 추가하므로 본문만 생성",
          },
          examples: resources
            .filter((resource) => positions.includes(resource.position))
            .map((resource) => ({
              position: resource.position,
              text: resource.example_text,
            })),
        },
        null,
        2,
      ),
      providerOptions: {
        openai: {
          user: userId,
          store: false,
        },
      },
    });

    const generated = result.output.messages;
    const generatedByPosition = new Map(
      generated.map((item) => [item.position, item.message.trim()]),
    );
    const missingResults = positions.filter(
      (position) => !generatedByPosition.get(position),
    );
    if (missingResults.length > 0) {
      throw new Error(
        `AI가 일부 문자를 생성하지 못했습니다: ${missingResults.join(", ")}번`,
      );
    }
    return positions.map((position) => ({
      position,
      message: enforceMessageLinkPolicy(
        position,
        generatedByPosition.get(position)!,
        project,
      ),
    }));
  } catch (error) {
    if (APICallError.isInstance(error)) {
      if (error.statusCode === 401)
        throw new Error("OpenAI API 키가 올바르지 않습니다.");
      if (error.statusCode === 402)
        throw new Error("OpenAI API 결제 또는 사용 한도를 확인해 주세요.");
      if (error.statusCode === 429)
        throw new Error(
          "AI 생성 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
        );
      throw new Error(
        `AI 생성에 실패했습니다. (HTTP ${error.statusCode ?? "unknown"})`,
      );
    }
    throw error;
  }
}
