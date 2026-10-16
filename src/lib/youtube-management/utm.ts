import type { LandingUtm } from "@/lib/course-landing-utms/model";

const normalize = (value: string) => value.normalize("NFKC").replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
export const landingUtmUrl = (item: LandingUtm) => item.short_url || item.url;

function similarity(a: string, b: string) {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(next[j - 1] + 1, previous[j] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    previous = next;
  }
  return 1 - previous[b.length] / Math.max(a.length, b.length);
}

export function channelLandingUtm(channel: string, items: LandingUtm[]) {
  const name = normalize(channel);
  if (!name) return "";
  const segments = channel.split(/[-–—|:·()[\]]/u).map(normalize).filter(Boolean);
  const ranked = items.map(item => {
    const referral = normalize(item.referral_code);
    let score = 0;
    if (referral === name) score = 1;
    else if (referral.length >= 2 && segments.includes(referral)) score = 0.98;
    else if (referral.length >= 3 && name.includes(referral)) score = 0.9 + 0.05 * referral.length / name.length;
    else if (name.length >= 4 && referral.includes(name)) score = 0.85 + 0.05 * name.length / referral.length;
    else if (Math.min(referral.length, name.length) >= 5) {
      const closeness = similarity(name, referral);
      if (closeness >= 0.85) score = closeness * 0.9;
    }
    return { item, score };
  }).filter(candidate => candidate.score > 0).sort((a, b) => b.score - a.score);
  if (!ranked.length) return "";
  // Ambiguous near-matches stay unselected; explicit selections are preserved below.
  const closest = ranked.filter(candidate => ranked[0].score - candidate.score < 0.02);
  const youtube = closest.filter(({item}) => ["유튜브", "youtube"].includes(normalize(item.medium)));
  const candidates = youtube.length ? youtube : closest;
  return candidates.length === 1 ? landingUtmUrl(candidates[0].item) : "";
}

export function resolveLandingUtm(channel: string, current: string, items: LandingUtm[]) {
  const selected = current && items.find(item => item.short_url === current || item.url === current);
  return selected ? landingUtmUrl(selected) : channelLandingUtm(channel, items) || current;
}
