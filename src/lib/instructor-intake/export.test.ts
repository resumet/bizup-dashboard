import assert from "node:assert/strict";
import test from "node:test";
import { answersSchema, EMPTY_ANSWERS, EMPTY_IMAGE_PATHS } from "./model";
import { instructorIntakeExportNames, instructorIntakeMarkdown } from "./export";

test("사전조사 파일과 이미지 폴더 이름을 강사명과 강의명으로 만든다", () => {
  assert.deepEqual(instructorIntakeExportNames({ instructorName: "조은정", courseName: "AI 강의" }), {
    archive: "조은정-AI 강의-사전조사.zip",
    markdown: "조은정-AI 강의-사전조사파일.md",
    imagesFolder: "조은정-AI 강의-사전조사-이미지",
  });
});

test("유튜브 출연 신청서에 기존 강의·자료의 영상 목록과 마무리 멘트를 출력한다", () => {
  const video = "https://youtu.be/abcdefghijk";
  const answers = answersSchema.parse({
    ...EMPTY_ANSWERS,
    youtubeUrls: [video],
    youtubeApplication: { previousAppearances: "이전 영상 값", desiredChannels: "삭제된 희망 채널", outro: "함께해요." },
  });
  assert.deepEqual(answers.youtubeApplication, { outro: "함께해요." });
  const markdown = instructorIntakeMarkdown(answers, 0, EMPTY_IMAGE_PATHS);
  assert.ok(markdown.includes(`### 이전 출연 영상 목록\n\n- ${video}`));
  assert.doesNotMatch(markdown, /### \d+-\d+\.|이전 영상 값|삭제된 희망 채널/);
  assert.ok(markdown.includes("### 마무리 멘트\n\n함께해요."));
  const noVideos = instructorIntakeMarkdown({ ...answers, youtubeUrls: [], youtubeUnavailable: true }, 0, EMPTY_IMAGE_PATHS);
  assert.ok(noVideos.includes("### 이전 출연 영상 목록\n\n없음"));
});

test("사전조사 마크다운은 항목 번호, 제목, 입력 내용을 순서대로 보관한다", () => {
  const markdown = instructorIntakeMarkdown({ ...EMPTY_ANSWERS, youtubeApplication: { scenes: "작업실 촬영" }, realName: "조은정", nickname: "승이맘", phone: "010-3091-1466" }, 0, EMPTY_IMAGE_PATHS);

  assert.match(markdown, /## 18\. 유튜브 출연 신청서\n/);
  assert.match(markdown, /### 영상에 포함되었으면 하는 필수 장면\n\n작업실 촬영/);
  assert.match(markdown, /## 1\. 본명\n\n조은정/);
  assert.match(markdown, /## 2\. 닉네임\n\n승이맘/);
  assert.match(markdown, /## 3\. 휴대폰번호\n\n010-3091-1466/);
});
