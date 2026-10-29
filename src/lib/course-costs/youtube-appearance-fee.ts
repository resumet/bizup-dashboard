import type {
  YoutubeAppearanceFeeChannelDetail,
  YoutubeAppearanceFeeCostDetails,
} from "./types";
import { normalizeYoutubeRsMatchValue, youtubeRsMatchScore } from "./youtube-rs";

export type YoutubeAppearanceFeeAppearanceSource = {
  id: string;
  channelName: string;
  channelUrl: string;
};

export type YoutubeAppearanceFeeAnalyzedChannelSource = {
  channelId: string;
  channelName: string;
  channelUrl: string;
  appearanceFee: number | null;
};

const MAX_CHANNELS = 50;

function safeFee(value: number | null) {
  return value !== null && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function matchingChannel(
  appearance: YoutubeAppearanceFeeAppearanceSource,
  channels: YoutubeAppearanceFeeAnalyzedChannelSource[],
) {
  return channels
    .map((channel) => ({
      channel,
      score: Math.max(
        youtubeRsMatchScore(appearance.channelName, channel.channelName),
        appearance.channelUrl
          && channel.channelUrl
          && normalizeYoutubeRsMatchValue(appearance.channelUrl) === normalizeYoutubeRsMatchValue(channel.channelUrl)
          ? 20_000
          : 0,
      ),
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score)[0]?.channel ?? null;
}

export function buildYoutubeAppearanceFeeCostDetails(
  appearances: YoutubeAppearanceFeeAppearanceSource[],
  analyzedChannels: YoutubeAppearanceFeeAnalyzedChannelSource[],
  calculatedAt = new Date().toISOString(),
): YoutubeAppearanceFeeCostDetails {
  return {
    kind: "YOUTUBE_APPEARANCE_FEE",
    version: 1,
    calculatedAt,
    channels: appearances.slice(0, MAX_CHANNELS).map((appearance) => {
      const linked = matchingChannel(appearance, analyzedChannels);
      const appearanceFee = safeFee(linked?.appearanceFee ?? null);
      return {
        appearanceId: appearance.id,
        channelName: appearance.channelName,
        channelUrl: appearance.channelUrl,
        linkedChannelId: linked?.channelId ?? null,
        linkedChannelName: linked?.channelName ?? "",
        linkedChannelUrl: linked?.channelUrl ?? "",
        appearanceFee,
        included: appearanceFee !== null,
      };
    }),
  };
}

export function youtubeAppearanceFeeTotals(details: YoutubeAppearanceFeeCostDetails) {
  return details.channels.reduce((totals, channel) => {
    if (!channel.included || channel.appearanceFee === null) return totals;
    const vatAmount = Math.round(channel.appearanceFee * 0.1);
    totals.channelCount += 1;
    totals.supplyAmount += channel.appearanceFee;
    totals.vatAmount += vatAmount;
    totals.finalAmount += channel.appearanceFee + vatAmount;
    return totals;
  }, { channelCount: 0, supplyAmount: 0, vatAmount: 0, finalAmount: 0 });
}

function requiredString(value: unknown, maxLength: number) {
  const result = typeof value === "string" ? value.trim() : "";
  if (!result || result.length > maxLength) throw new Error("유튜브 출연료 상세 내역이 올바르지 않습니다.");
  return result;
}

function optionalString(value: unknown, maxLength: number) {
  const result = typeof value === "string" ? value.trim() : "";
  if (result.length > maxLength) throw new Error("유튜브 출연료 상세 내역이 올바르지 않습니다.");
  return result;
}

export function parseYoutubeAppearanceFeeCostDetails(value: unknown): YoutubeAppearanceFeeCostDetails | null {
  if (value === null || value === undefined) return null;
  const input = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
  if (input.kind !== "YOUTUBE_APPEARANCE_FEE" || input.version !== 1 || !Array.isArray(input.channels) || input.channels.length > MAX_CHANNELS) {
    throw new Error("유튜브 출연료 상세 내역이 올바르지 않습니다.");
  }
  const channels = input.channels.map((raw): YoutubeAppearanceFeeChannelDetail => {
    const channel = typeof raw === "object" && raw !== null ? raw as Record<string, unknown> : {};
    const rawFee = channel.appearanceFee;
    const appearanceFee = rawFee === null || rawFee === undefined ? null : safeFee(Number(rawFee));
    if (rawFee !== null && rawFee !== undefined && appearanceFee === null) {
      throw new Error("유튜브 출연료는 0원 이상의 정수여야 합니다.");
    }
    return {
      appearanceId: requiredString(channel.appearanceId, 100),
      channelName: requiredString(channel.channelName, 200),
      channelUrl: optionalString(channel.channelUrl, 2_048),
      linkedChannelId: channel.linkedChannelId === null || channel.linkedChannelId === undefined
        ? null
        : requiredString(channel.linkedChannelId, 100),
      linkedChannelName: optionalString(channel.linkedChannelName, 200),
      linkedChannelUrl: optionalString(channel.linkedChannelUrl, 2_048),
      appearanceFee,
      included: channel.included !== false,
    };
  });
  return {
    kind: "YOUTUBE_APPEARANCE_FEE",
    version: 1,
    calculatedAt: typeof input.calculatedAt === "string" && !Number.isNaN(Date.parse(input.calculatedAt))
      ? input.calculatedAt
      : new Date().toISOString(),
    channels,
  };
}
