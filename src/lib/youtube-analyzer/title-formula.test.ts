import assert from "node:assert/strict";
import test from "node:test";

import { topVideoGroups, type Video } from "./model";

test("조회수·좋아요·댓글별 상위 영상 제목 후보를 따로 고른다", () => {
  const videos: Video[] = Array.from({ length: 9 }, (_, index) => ({
    id: String(index),
    title: `영상 ${index}`,
    publishedAt: "2026-09-01T00:00:00Z",
    views: index,
    likes: 8 - index,
    comments: index === 4 ? 100 : 0,
  }));
  const groups = topVideoGroups(videos);
  assert.equal(groups.views.length, 7);
  assert.equal(groups.views[0].id, "8");
  assert.equal(groups.likes[0].id, "0");
  assert.deepEqual(groups.comments.map(video => video.id), ["4"]);
});
test("비공개 지표와 0인 지표는 제목 공식의 상위 후보에서 제외한다", () => {
  const videos: Video[] = [{
    id: "a",
    title: "영상",
    publishedAt: "2026-09-01T00:00:00Z",
    views: 1,
    likes: null,
    comments: null,
  }];
  const groups = topVideoGroups(videos);
  assert.equal(groups.views.length, 1);
  assert.equal(groups.likes.length, 0);
  assert.equal(groups.comments.length, 0);
});
