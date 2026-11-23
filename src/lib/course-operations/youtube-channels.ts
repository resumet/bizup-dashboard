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

function youtubeChannelHref(value: string | null) {
  const url = value && URL.parse(value);
  if (!url || !["https:", "http:"].includes(url.protocol) ||
      !/^(?:[a-z0-9-]+\.)*youtube\.com$/.test(url.hostname) || url.pathname === "/") return null;
  return url.href;
}

export function resolveYoutubeAppearanceChannel(
  suggestions: YoutubeChannelSuggestion[],
  channelName: string,
  savedUrl: string | null,
) {
  const href = youtubeChannelHref(savedUrl);
  const byUrl = href && suggestions.find(item => youtubeChannelHref(item.channelUrl) === href);
  if (byUrl) return { name: byUrl.alias || byUrl.channelName, href };

  const name = normalizeChannelName(channelName);
  const byName = suggestions.filter(item => normalizeChannelName(item.channelName) === name);
  const matches = byName.length ? byName : suggestions.filter(item => item.alias && normalizeChannelName(item.alias) === name);
  const match = matches.length === 1 ? matches[0] : undefined;
  return { name: match?.alias || channelName, href: href ?? youtubeChannelHref(match?.channelUrl ?? null) };
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
