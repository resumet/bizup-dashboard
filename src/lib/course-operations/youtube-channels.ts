import type { YoutubeChannelSuggestion } from "./types";

type YoutubeAnalyzedChannelRow = {
  channel: unknown;
  alias?: unknown;
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
  rows: YoutubeAnalyzedChannelRow[],
): YoutubeChannelSuggestion[] {
  const seen = new Set<string>();

  return rows.flatMap((row) => {
    if (
      !row.channel ||
      typeof row.channel !== "object" ||
      Array.isArray(row.channel)
    ) {
      return [];
    }

    const channel = row.channel as Record<string, unknown>;
    const channelName =
      typeof channel.name === "string" ? channel.name.trim() : "";
    const channelUrl =
      typeof channel.url === "string" ? decodeReadableUrl(channel.url) : "";
    const alias = typeof row.alias === "string" ? row.alias.trim() || null : null;
    if (!channelName || !channelUrl) return [];

    const key = `${channelName.toLocaleLowerCase("ko-KR")}\u0000${channelUrl.toLocaleLowerCase("ko-KR")}`;
    if (seen.has(key)) return [];
    seen.add(key);

    return [{ channelName, channelUrl, alias }];
  });
}

function normalizeChannelName(value: string) {
  return value.trim().toLocaleLowerCase("ko-KR");
}

export function findYoutubeChannelUrlByName(
  suggestions: YoutubeChannelSuggestion[],
  channelName: string,
) {
  const normalizedChannelName = normalizeChannelName(channelName);
  if (!normalizedChannelName) return "";

  return (
    suggestions.find(
      (suggestion) =>
        normalizeChannelName(suggestion.channelName) === normalizedChannelName
        || normalizeChannelName(suggestion.alias ?? "") === normalizedChannelName,
    )?.channelUrl ?? ""
  );
}

export function displayYoutubeChannelName(
  suggestions: YoutubeChannelSuggestion[],
  channelName: string,
) {
  const normalizedChannelName = normalizeChannelName(channelName);
  const matched = suggestions.find((suggestion) =>
    normalizeChannelName(suggestion.channelName) === normalizedChannelName
    || normalizeChannelName(suggestion.alias ?? "") === normalizedChannelName,
  );
  return matched?.alias || channelName;
}
