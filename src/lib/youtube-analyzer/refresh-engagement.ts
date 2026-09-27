export type StoredEngagementVideo = {
  video_id: string;
  published_at: string;
  data: { likes?: unknown; comments?: unknown } | null;
};

export type Recent30Engagement = {
  recent30Likes: number | null;
  recent30Comments: number | null;
  recent30Count: number;
};

function average(values: unknown[]): number | null {
  const available = values.filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0,
  );
  if (!available.length) return null;
  return available.reduce((sum, value) => sum + value, 0) / available.length;
}

export function recent30Engagement(videos: StoredEngagementVideo[]): Recent30Engagement {
  const recent = [...videos]
    .sort((a, b) => b.published_at.localeCompare(a.published_at) || a.video_id.localeCompare(b.video_id))
    .slice(0, 30);

  return {
    recent30Likes: average(recent.map((video) => video.data?.likes)),
    recent30Comments: average(recent.map((video) => video.data?.comments)),
    recent30Count: recent.length,
  };
}
