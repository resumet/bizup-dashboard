import type { LandingUtm } from "@/lib/course-landing-utms/model";

const normalize = (value: string) => value.normalize("NFKC").replace(/\s+/gu, "").toLowerCase();
export const landingUtmUrl = (item: LandingUtm) => item.short_url || item.url;

export function channelLandingUtm(channel: string, items: LandingUtm[]) {
  if (!channel.trim()) return "";
  const matches = items.filter(item => normalize(item.referral_code) === normalize(channel));
  const youtube = matches.filter(item => ["유튜브", "youtube"].includes(normalize(item.medium)));
  const candidates = youtube.length ? youtube : matches;
  return candidates.length === 1 ? landingUtmUrl(candidates[0]) : "";
}

export function resolveLandingUtm(channel: string, current: string, items: LandingUtm[]) {
  const selected = current && items.find(item => item.short_url === current || item.url === current);
  return selected ? landingUtmUrl(selected) : channelLandingUtm(channel, items) || current;
}
