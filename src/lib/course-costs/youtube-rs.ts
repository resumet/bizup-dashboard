import type {
  YoutubeRsChannelDetail,
  YoutubeRsCostDetails,
  YoutubeRsPayerDetail,
} from "./types";

export type YoutubeRsAppearanceSource = {
  id: string;
  channelName: string;
  channelUrl: string;
};

export type YoutubeRsAnalyzedChannelSource = {
  channelId: string;
  channelName: string;
  channelUrl: string;
  rsPercent: number | null;
};

export type YoutubeRsOrderSource = {
  id: string;
  name: string;
  rsLabel: string;
  currentAmount: number;
  status: string;
};

const MAX_CHANNELS = 50;
const MAX_PAYERS = 5_000;

export function normalizeYoutubeRsMatchValue(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("ko-KR")
    .replace(/[^0-9a-z가-힣]/gu, "");
}

function editDistance(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        (current[rightIndex - 1] ?? 0) + 1,
        (previous[rightIndex] ?? 0) + 1,
        (previous[rightIndex - 1] ?? 0) + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length] ?? 0;
}

export function youtubeRsMatchScore(leftValue: string, rightValue: string) {
  const left = normalizeYoutubeRsMatchValue(leftValue);
  const right = normalizeYoutubeRsMatchValue(rightValue);
  if (!left || !right) return 0;
  if (left === right) return 10_000 + left.length;
  const shorterLength = Math.min(left.length, right.length);
  if (shorterLength >= 3 && (left.includes(right) || right.includes(left))) {
    return 5_000 + shorterLength;
  }
  if (shorterLength >= 4) {
    const distance = editDistance(left, right);
    const tolerance = Math.max(1, Math.floor(Math.max(left.length, right.length) * 0.2));
    if (distance <= tolerance) return 1_000 - distance;
  }
  return 0;
}

function isPaidOrder(status: string) {
  return status.normalize("NFKC").trim() === "결제완료";
}

function safePercent(value: number | null) {
  return value !== null && Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
}

export function youtubeRsFee(paymentAmount: number, rsPercent: number | null) {
  if (!Number.isFinite(paymentAmount) || paymentAmount <= 0 || rsPercent === null) return 0;
  return Math.max(0, Math.round(paymentAmount * rsPercent / 100));
}

function analyzedChannelForAppearance(
  appearance: YoutubeRsAppearanceSource,
  channels: YoutubeRsAnalyzedChannelSource[],
) {
  return channels
    .map((channel) => ({
      channel,
      score: Math.max(
        youtubeRsMatchScore(appearance.channelName, channel.channelName),
        appearance.channelUrl && channel.channelUrl && normalizeYoutubeRsMatchValue(appearance.channelUrl) === normalizeYoutubeRsMatchValue(channel.channelUrl) ? 20_000 : 0,
      ),
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score)[0]?.channel ?? null;
}

export function buildYoutubeRsCostDetails(
  appearances: YoutubeRsAppearanceSource[],
  analyzedChannels: YoutubeRsAnalyzedChannelSource[],
  orders: YoutubeRsOrderSource[],
  calculatedAt = new Date().toISOString(),
): YoutubeRsCostDetails {
  const seenChannels = new Set<string>();
  const channelDetails: YoutubeRsChannelDetail[] = [];

  for (const appearance of appearances) {
    const key = normalizeYoutubeRsMatchValue(appearance.channelName || appearance.channelUrl);
    if (!key || seenChannels.has(key)) continue;
    seenChannels.add(key);
    const analyzed = analyzedChannelForAppearance(appearance, analyzedChannels);
    channelDetails.push({
      appearanceId: appearance.id,
      channelName: appearance.channelName,
      channelUrl: appearance.channelUrl,
      rsPercent: safePercent(analyzed?.rsPercent ?? null),
      payers: [],
    });
  }

  const eligibleOrders = orders.filter((order) =>
    order.rsLabel.trim() && isPaidOrder(order.status) && Number.isFinite(order.currentAmount) && order.currentAmount > 0,
  );
  for (const order of eligibleOrders) {
    const match = channelDetails
      .map((channel, index) => ({ index, score: youtubeRsMatchScore(order.rsLabel, channel.channelName) }))
      .filter((candidate) => candidate.score > 0)
      .sort((left, right) => right.score - left.score)[0];
    if (!match) continue;
    const channel = channelDetails[match.index];
    channel.payers.push({
      orderId: order.id,
      name: order.name,
      rsLabel: order.rsLabel,
      paymentAmount: Math.round(order.currentAmount),
      feeAmount: youtubeRsFee(order.currentAmount, channel.rsPercent),
      included: true,
    });
  }

  return { kind: "YOUTUBE_RS", version: 1, calculatedAt, channels: channelDetails };
}

export function recalculateYoutubeRsChannel(channel: YoutubeRsChannelDetail): YoutubeRsChannelDetail {
  const rsPercent = safePercent(channel.rsPercent);
  return {
    ...channel,
    rsPercent,
    payers: channel.payers.map((payer) => ({
      ...payer,
      feeAmount: youtubeRsFee(payer.paymentAmount, rsPercent),
    })),
  };
}

export function youtubeRsTotals(details: YoutubeRsCostDetails) {
  return details.channels.reduce((totals, channel) => {
    for (const payer of channel.payers) {
      if (!payer.included) continue;
      totals.payerCount += 1;
      totals.paymentAmount += payer.paymentAmount;
      totals.feeAmount += payer.feeAmount;
    }
    return totals;
  }, { payerCount: 0, paymentAmount: 0, feeAmount: 0 });
}

function requiredString(value: unknown, maxLength: number) {
  const result = typeof value === "string" ? value.trim() : "";
  if (!result || result.length > maxLength) throw new Error("유튜브 RS 상세 내역이 올바르지 않습니다.");
  return result;
}

function optionalString(value: unknown, maxLength: number) {
  const result = typeof value === "string" ? value.trim() : "";
  if (result.length > maxLength) throw new Error("유튜브 RS 상세 내역이 올바르지 않습니다.");
  return result;
}

function payerFromUnknown(value: unknown): YoutubeRsPayerDetail {
  const input = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
  const paymentAmount = Number(input.paymentAmount);
  if (!Number.isSafeInteger(paymentAmount) || paymentAmount < 0) throw new Error("유튜브 RS 결제금액이 올바르지 않습니다.");
  return {
    orderId: requiredString(input.orderId, 100),
    name: requiredString(input.name, 200),
    rsLabel: requiredString(input.rsLabel, 200),
    paymentAmount,
    feeAmount: 0,
    included: input.included !== false,
  };
}

export function parseYoutubeRsCostDetails(value: unknown): YoutubeRsCostDetails | null {
  if (value === null || value === undefined) return null;
  const input = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
  if (input.kind !== "YOUTUBE_RS" || input.version !== 1 || !Array.isArray(input.channels) || input.channels.length > MAX_CHANNELS) {
    throw new Error("유튜브 RS 상세 내역이 올바르지 않습니다.");
  }
  let payerCount = 0;
  const channels = input.channels.map((raw): YoutubeRsChannelDetail => {
    const channel = typeof raw === "object" && raw !== null ? raw as Record<string, unknown> : {};
    const rawPayers = Array.isArray(channel.payers) ? channel.payers : [];
    payerCount += rawPayers.length;
    if (payerCount > MAX_PAYERS) throw new Error("유튜브 RS 결제자 내역은 최대 5,000명까지 저장할 수 있습니다.");
    return recalculateYoutubeRsChannel({
      appearanceId: requiredString(channel.appearanceId, 100),
      channelName: requiredString(channel.channelName, 200),
      channelUrl: optionalString(channel.channelUrl, 2_048),
      rsPercent: channel.rsPercent === null || channel.rsPercent === undefined ? null : safePercent(Number(channel.rsPercent)),
      payers: rawPayers.map(payerFromUnknown),
    });
  });
  return {
    kind: "YOUTUBE_RS",
    version: 1,
    calculatedAt: typeof input.calculatedAt === "string" && !Number.isNaN(Date.parse(input.calculatedAt)) ? input.calculatedAt : new Date().toISOString(),
    channels,
  };
}
