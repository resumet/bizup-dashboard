import assert from "node:assert/strict";
import test from "node:test";
import { EMPTY_ANSWERS, EMPTY_IMAGE_PATHS } from "./model";
import { instructorIntakeExportNames, instructorIntakeMarkdown } from "./export";

test("사전조사 파일과 이미지 폴더 이름을 강사명과 강의명으로 만든다", () => {
  assert.deepEqual(instructorIntakeExportNames({ instructorName: "조은정", courseName: "AI 강의" }), {
    archive: "조은정-AI 강의-사전조사.zip",
    markdown: "조은정-AI 강의-사전조사파일.md",
    imagesFolder: "조은정-AI 강의-사전조사-이미지",
  });
});

test("사전조사 마크다운은 항목 번호, 제목, 입력 내용을 순서대로 보관한다", () => {
  const markdown = instructorIntakeMarkdown({ ...EMPTY_ANSWERS, youtubeApplication: { scenes: "작업실 촬영" }, realName: "조은정", nickname: "승이맘", phone: "010-3091-1466" }, 0, EMPTY_IMAGE_PATHS);

  assert.match(markdown, /## 38\. 유튜브 출연 신청서 정보/);
  assert.match(markdown, /### 38-8\. 촬영 장면·장소·소품 및 스토리보드\n\n작업실 촬영/);
  assert.match(markdown, /## 1\. 본명\n\n조은정/);
  assert.match(markdown, /## 2\. 닉네임\n\n승이맘/);
  assert.match(markdown, /## 3\. 휴대폰번호\n\n010-3091-1466/);
});
