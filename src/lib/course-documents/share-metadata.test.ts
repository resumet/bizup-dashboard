import assert from "node:assert/strict";
import test from "node:test";
import { instagramShareMetadata } from "./share-metadata";

const course = { name: "수익화 강의", instructor_name: "홍길동", banner_image_path: "private/banner.png", updated_at: "2026-10-15T09:00:00Z" };
test("공유 제목·설명·OG·Twitter는 강의 정보와 대표이미지를 사용한다", () => {
  const metadata = instagramShareMetadata(course, "/write/token/share-image");
  assert.deepEqual(metadata.title, { absolute: "홍길동-수익화 강의-인스타컨텐츠" });
  assert.equal(metadata.openGraph?.title, "홍길동-수익화 강의-인스타컨텐츠");
  assert.equal(metadata.twitter?.title, metadata.openGraph?.title);
  assert.equal(metadata.description, "홍길동 강사님의 수익화 강의 인스타그램 콘텐츠입니다.");
  assert.ok(JSON.stringify(metadata.openGraph?.images).includes("/write/token/share-image?v=2026-10-15T09%3A00%3A00Z"));
  assert.ok(!JSON.stringify(metadata).includes("private/banner.png"));
  assert.ok(metadata.twitter && "card" in metadata.twitter);
  assert.equal(metadata.twitter.card, "summary_large_image");
});
test("대표이미지 없는 강의와 비활성 공유는 깨진 이미지나 강의 정보를 노출하지 않는다", () => {
  const noBanner = instagramShareMetadata({ ...course, banner_image_path: null }, "/write/token/share-image");
  assert.deepEqual(noBanner.openGraph?.images, []);
  assert.ok(noBanner.twitter && "card" in noBanner.twitter);
  assert.equal(noBanner.twitter.card, "summary");
  const unavailable = instagramShareMetadata(null, "");
  assert.deepEqual(unavailable.title, { absolute: "인스타컨텐츠" });
  assert.deepEqual(unavailable.openGraph?.images, []);
  assert.ok(!JSON.stringify(unavailable).includes(course.name));
});
test("대표이미지 변경 시 공유 이미지 주소의 버전이 갱신된다", () => {
  const original = instagramShareMetadata(course, "/article/example/share-image");
  const changed = instagramShareMetadata({ ...course, updated_at: "2026-10-16T00:00:00Z" }, "/article/example/share-image");
  assert.notDeepEqual(original.openGraph?.images, changed.openGraph?.images);
});
