import assert from "node:assert/strict";
import test from "node:test";
import { youtubeShareMetadata, youtubeShareTitle } from "./share-metadata";

const course = {
  name: "수익화 강의",
  instructor_name: "홍길동",
  cohort: "1",
  banner_image_path: "private/banner.png",
  updated_at: "2026-10-16T09:00:00Z",
};

test("유튜브 공유 제목은 강사명-강의명-기수 형식이며 기수 단위를 중복하지 않는다", () => {
  assert.equal(youtubeShareTitle(course), "홍길동-수익화 강의-1기");
  assert.equal(youtubeShareTitle({ ...course, cohort: "2기" }), "홍길동-수익화 강의-2기");
});

test("카카오 공유 메타데이터는 절대 공개 주소와 대표이미지를 사용한다", () => {
  const metadata = youtubeShareMetadata(
    course,
    "schedule",
    "/public/youtube/schedule/token",
    "/public/youtube/schedule/token/share-image",
  );
  assert.deepEqual(metadata.title, { absolute: "홍길동-수익화 강의-1기" });
  const openGraph = metadata.openGraph;
  assert.ok(openGraph && "type" in openGraph);
  assert.equal(openGraph.title, "홍길동-수익화 강의-1기");
  assert.equal(openGraph.type, "website");
  assert.equal(openGraph.locale, "ko_KR");
  assert.equal(openGraph.siteName, "BizUp");
  assert.equal(openGraph.url, "https://bizup-dashboard.vercel.app/public/youtube/schedule/token");
  assert.equal(metadata.twitter?.title, openGraph.title);
  assert.ok(JSON.stringify(openGraph.images).includes("/share-image?v=2026-10-16T09%3A00%3A00Z"));
  assert.ok(!JSON.stringify(metadata).includes("private/banner.png"));
  assert.ok(metadata.twitter && "card" in metadata.twitter);
  assert.equal(metadata.twitter.card, "summary_large_image");
});

test("대표이미지가 없거나 공유가 비활성 상태면 깨진 이미지와 강의 정보를 노출하지 않는다", () => {
  const noBanner = youtubeShareMetadata({ ...course, banner_image_path: null }, "brief", "/public/youtube/brief/token", "");
  assert.deepEqual(noBanner.openGraph?.images, []);
  assert.ok(noBanner.twitter && "card" in noBanner.twitter);
  assert.equal(noBanner.twitter.card, "summary");

  const unavailable = youtubeShareMetadata(null, "schedule", "/public/youtube/schedule/token", "");
  assert.deepEqual(unavailable.title, { absolute: "강사 출연 유튜브 관리" });
  assert.deepEqual(unavailable.openGraph?.images, []);
  assert.ok(!JSON.stringify(unavailable).includes(course.name));
});
