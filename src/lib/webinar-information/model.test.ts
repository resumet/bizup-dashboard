import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWebinarInformationShareText,
  parseWebinarInformation,
} from "./model";

test("웨비나 정보의 텍스트와 웹 주소를 정규화한다", () => {
  assert.deepEqual(parseWebinarInformation({
    courseMaterialsLink: " https://example.com/materials ",
    openingVideoUrl: "https://youtu.be/example",
    youtubeTitle: "  후킹 제목  ",
    youtubeDescription: "강의 설명",
    commandDeckUrl: "https://docs.google.com/presentation/d/example/edit",
    bannerStorageUrl: "",
    youtubeLiveUrl: "https://youtube.com/live/example",
  }), {
    courseMaterialsLink: "https://example.com/materials",
    openingVideoUrl: "https://youtu.be/example",
    youtubeTitle: "후킹 제목",
    youtubeDescription: "강의 설명",
    commandDeckUrl: "https://docs.google.com/presentation/d/example/edit",
    bannerStorageUrl: "",
    youtubeLiveUrl: "https://youtube.com/live/example",
  });
  assert.throws(
    () => parseWebinarInformation({ youtubeLiveUrl: "javascript:alert(1)" }),
    /http 또는 https/u,
  );
});

test("공유 텍스트에 강의와 웨비나 정보를 정해진 순서로 요약한다", () => {
  const text = buildWebinarInformationShareText(parseWebinarInformation({
    courseMaterialsLink: "https://example.com/materials",
    openingVideoUrl: "https://youtu.be/opening",
    youtubeTitle: "후킹 제목",
    youtubeDescription: "강의 설명",
    commandDeckUrl: "https://docs.google.com/presentation/d/example/edit",
    bannerStorageUrl: "",
    youtubeLiveUrl: "https://youtube.com/live/example",
  }), {
    courseName: "매출 강의",
    instructorName: "김선아",
    cohort: "1",
    openingVideoName: "지난 라이브",
  });

  assert.match(text, /강의: 김선아 \| 매출 강의 \| 1기/u);
  assert.match(text, /초반 영상: 지난 라이브 \| https:\/\/youtu\.be\/opening/u);
  assert.match(text, /배너 저장소: 미입력/u);
});
