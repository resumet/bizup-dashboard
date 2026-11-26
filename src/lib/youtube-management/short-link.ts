export type PublicYoutubeKind = "schedule";

const SHORT_CODE_PATTERN = /^[A-Za-z0-9_-]{16}$/u;
const SHORT_PATH_PATTERN = /^(s)-([A-Za-z0-9_-]{16})$/u;

export function youtubeShortPath(kind: PublicYoutubeKind, shortCode: string) {
  if (kind !== "schedule" || !SHORT_CODE_PATTERN.test(shortCode)) return null;
  return `/y/s-${shortCode}`;
}

export function parseYoutubeShortPathCode(value: string): { kind: PublicYoutubeKind; shortCode: string } | null {
  const match = SHORT_PATH_PATTERN.exec(value);
  if (!match) return null;
  return { kind: "schedule", shortCode: match[2] };
}
