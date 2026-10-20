import type { LandingUtm } from "./model";

function fallbackShareLabel(item: LandingUtm) {
  const medium = item.medium === "인스타그램" ? "인스타" : item.medium;
  return item.channel === "오가닉" && item.medium === "무료강의 안내방"
    ? `오가닉 ${medium}`
    : medium;
}

export function formatLandingUtmShareContent(
  items: readonly LandingUtm[],
  instructorName: string,
) {
  const name = instructorName.trim().replace(/\s*강사님?$/u, "");
  const heading = name ? `[${name}강사님 UTM]` : "[강의 UTM]";
  const lines = items.map((item) => {
    const label = item.referral_code.trim() || fallbackShareLabel(item);
    return `${label} ${item.short_url || item.url}`;
  });

  return [heading, ...lines].join("\n");
}
