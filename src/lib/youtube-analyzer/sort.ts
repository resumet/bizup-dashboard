import type { Analysis } from "./model";

export type ChannelSort = "position" | "subscribers" | "topViews" | "exclude1" | "recent20";
export type SortDirection = "desc" | "asc";

function sortValue(run: Analysis, sort: ChannelSort): number | null {
  switch (sort) {
    case "subscribers": return run.channel.subscribers;
    case "topViews": return run.metrics.top?.views ?? null;
    case "exclude1": return run.metrics.exclude1;
    case "recent20": return run.metrics.recent20;
    case "position": return null;
  }
}

export function sortChannels(runs: Analysis[], sort: ChannelSort, direction: SortDirection = "desc"): Analysis[] {
  return [...runs].sort((a, b) => {
    if (sort !== "position") {
      const aValue = sortValue(a, sort);
      const bValue = sortValue(b, sort);
      if (aValue === null && bValue !== null) return 1;
      if (bValue === null && aValue !== null) return -1;
      if (aValue !== null && bValue !== null && aValue !== bValue) {
        return direction === "desc" ? bValue - aValue : aValue - bValue;
      }
    }
    return a.position - b.position || a.channel_id.localeCompare(b.channel_id);
  });
}
