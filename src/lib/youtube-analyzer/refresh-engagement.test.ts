import { test } from "node:test";
import assert from "node:assert/strict";
import { recent30Engagement, type StoredEngagementVideo } from "./refresh-engagement";

test("recent 30 engagement uses newest 30, stable video ID ties, and available counts", () => {
  const videos: StoredEngagementVideo[] = Array.from({ length: 29 }, (_, index) => ({
    video_id: `video-${String(index + 1).padStart(2, "0")}`,
    published_at: `2026-03-${String(index + 1).padStart(2, "0")}T00:00:00Z`,
    data: { likes: 2, comments: 4 },
  }));
  videos.push(
    { video_id: "a", published_at: "2026-02-01T00:00:00Z", data: { likes: 10, comments: null } },
    { video_id: "b", published_at: "2026-02-01T00:00:00Z", data: { likes: 1000, comments: 1000 } },
  );

  const result = recent30Engagement(videos);
  assert.deepEqual(result, {
    recent30Likes: (29 * 2 + 10) / 30,
    recent30Comments: 4,
    recent30Count: 30,
  });
});

test("missing engagement stays null while zero counts as data", () => {
  assert.deepEqual(recent30Engagement([]), {
    recent30Likes: null,
    recent30Comments: null,
    recent30Count: 0,
  });
  assert.deepEqual(recent30Engagement([
    { video_id: "a", published_at: "2026-01-02T00:00:00Z", data: { likes: null, comments: undefined } },
    { video_id: "b", published_at: "2026-01-01T00:00:00Z", data: { likes: 0, comments: 0 } },
  ]), {
    recent30Likes: 0,
    recent30Comments: 0,
    recent30Count: 2,
  });
});
