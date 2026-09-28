import assert from "node:assert/strict";
import test from "node:test";
import type { Analysis } from "./model";
import { sortChannels, type ChannelSort } from "./sort";

function run(id: string, position: number, values: { subscribers: number | null; top: number | null; exclude1: number | null; recent20: number | null; recent30Comments: number | null; recent30Likes: number | null }): Analysis {
  return {
    position,
    channel_id: id,
    channel: { id, name: id, url: "", thumbnail: null, reported: 0, subscribers: values.subscribers, playlist: "" },
    email: null,
    category: null,
    appearance_fee: null,
    rs_percent: null,
    memo: null,
    excluded_from_updates: false,
    metrics: {
      count: 0,
      top: values.top === null ? null : { id: `${id}-video`, title: id, publishedAt: "2026-01-01", views: values.top, likes: null, comments: null },
      exclude1: values.exclude1,
      exclude3: null,
      recent5: null,
      recent10: null,
      recent20: values.recent20,
      recent30Likes: values.recent30Likes,
      recent30Comments: values.recent30Comments,
      recent30Count: 0,
      samples: [0, 0, 0],
    },
    warnings: [],
    first_analyzed_at: "2026-01-01",
    last_analyzed_at: "2026-01-01",
  };
}

const runs = [
  run("first", 1, { subscribers: 10, top: 30, exclude1: 20, recent20: 50, recent30Comments: 100, recent30Likes: 20 }),
  run("second", 2, { subscribers: 100, top: 10, exclude1: 50, recent20: 20, recent30Comments: 10, recent30Likes: 100 }),
  run("third", 3, { subscribers: 10, top: 100, exclude1: 10, recent20: 20, recent30Comments: 100, recent30Likes: 0 }),
  run("unknown", 4, { subscribers: null, top: null, exclude1: null, recent20: null, recent30Comments: null, recent30Likes: null }),
];

test("each channel metric sorts high first, with missing values last and ties in registration order", () => {
  const expected: Record<Exclude<ChannelSort, "position">, string[]> = {
    subscribers: ["second", "first", "third", "unknown"],
    topViews: ["third", "first", "second", "unknown"],
    exclude1: ["second", "first", "third", "unknown"],
    recent20: ["first", "second", "third", "unknown"],
    recent30Comments: ["first", "third", "second", "unknown"],
    recent30Likes: ["second", "first", "third", "unknown"],
  };
  for (const sort of Object.keys(expected) as Array<Exclude<ChannelSort, "position">>) {
    assert.deepEqual(sortChannels(runs, sort).map(item => item.channel_id), expected[sort]);
  }
  assert.deepEqual(runs.map(item => item.channel_id), ["first", "second", "third", "unknown"]);
});

test("ascending order keeps missing values last, and registered order remains the default", () => {
  assert.deepEqual(sortChannels(runs, "subscribers", "asc").map(item => item.channel_id), ["first", "third", "second", "unknown"]);
  assert.deepEqual(sortChannels(runs, "recent30Comments", "asc").map(item => item.channel_id), ["second", "first", "third", "unknown"]);
  assert.deepEqual(sortChannels(runs, "recent30Likes", "asc").map(item => item.channel_id), ["third", "first", "second", "unknown"]);
  assert.deepEqual(sortChannels([...runs].reverse(), "position").map(item => item.channel_id), ["first", "second", "third", "unknown"]);
});
