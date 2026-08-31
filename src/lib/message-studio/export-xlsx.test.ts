import assert from "node:assert/strict";
import test from "node:test";

import { readSheet } from "read-excel-file/node";

import { buildMessageStudioXlsx } from "./export-xlsx";
import type { MessageStudioProject, MessageStudioResource } from "./types";

test("이모지가 포함된 신규 문자 30개를 XLSX로 보존한다", async () => {
  const project = {
    id: "project",
    workspace_id: "workspace",
    course_id: null,
    course_name: "AI 강의 🚀",
    instructor_name: "권강사",
    course_features: "실전 중심",
    target_audience: "수익화를 시작할 사람",
    payment_link: "https://example.com/pay",
    inquiry_link: "https://example.com/chat",
    curriculum_link: "https://example.com/curriculum",
    replay_link: "https://example.com/replay",
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
  } satisfies MessageStudioProject;
  const resources = Array.from({ length: 30 }, (_, index) => ({
    id: String(index + 1),
    position: index + 1,
    example_text: `예시 ${index + 1}`,
    generated_text: `신규 문자 ${index + 1} ✨🔥`,
    generation_count: 1,
    generated_model: "test-model",
    generated_at: new Date(0).toISOString(),
  })) satisfies MessageStudioResource[];

  const buffer = await buildMessageStudioXlsx(project, resources);
  const rows = await readSheet(buffer, "문자30개");

  assert.equal(rows.length, 31);
  assert.equal(rows[1][2], "신규 문자 1 ✨🔥\n\nhttps://example.com/pay");
  assert.equal(
    rows[30][2],
    "신규 문자 30 ✨🔥\n\n✅ 수강 신청 링크 ✅\nhttps://example.com/pay\n\n👉 결제 및 수강 문의하기\nhttps://example.com/chat\n\n💘 커리큘럼 보기\nhttps://example.com/curriculum\n\n💌 무료강의 수강 선물 받기\nhttps://example.com/replay",
  );
});
