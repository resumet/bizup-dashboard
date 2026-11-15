export function applicantApplyUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.origin !== "https://admin.systemnova.co.kr" || url.username || url.password) return null;
    const match = /^\/free-courses\/([\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12})(?:\/apply)?\/?$/iu.exec(url.pathname);
    if (!match) return null;
    return `${url.origin}/free-courses/${match[1]}/apply`;
  } catch {
    return null;
  }
}
