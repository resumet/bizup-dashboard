import type { YoutubeChannelSuggestion } from "./types";

type YoutubeChannelRow = {
  channel_name: string | null;
  channel_url: string | null;
};

export function decodeReadableUrl(value: string) {
  const normalized = value.trim();
  if (!normalized) return "";

  try {
    return decodeURI(normalized);
  } catch {
    return normalized;
  }
}

export function buildYoutubeChannelSuggestions(
  rows: YoutubeChannelRow[],
): YoutubeChannelSuggestion[] {
  const seen = new Set<string>();

  return rows.flatMap((row) => {
    const channelName = row.channel_name?.trim() ?? "";
    const channelUrl = decodeReadableUrl(row.channel_url ?? "");
    if (!channelName && !channelUrl) return [];

    const key = `${channelName.toLocaleLowerCase("ko-KR")}\u0000${channelUrl.toLocaleLowerCase("ko-KR")}`;
    if (seen.has(key)) return [];
    seen.add(key);

    return [{ channelName, channelUrl }];
  });
}
