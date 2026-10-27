import type { WbsItem, WbsTaskLink } from "./types";

export const WBS_INTERNAL_PAGES = [
  { label: "유튜브 출연 관리", url: "/services/youtube-management/{courseId}" },
  { label: "강사 인스타그램 관리", url: "/services/instagram-management/{courseId}" },
  { label: "강의 상세", url: "/services/course-operations/{courseId}" },
  { label: "강의 광고성과", url: "/services/ad-performance" },
] as const;

export function validTaskLink(link: WbsTaskLink) {
  if (!link.url || /[\\\s\u0000-\u001f\u007f]/u.test(link.url)) return false;
  if (link.type === "internal") {
    // Reject protocol-relative URLs, including encoded slashes/backslashes.
    let decoded: string;
    try { decoded = decodeURIComponent(link.url); } catch { return false; }
    return decoded.startsWith("/") && !decoded.startsWith("//") && !/[\\\u0000-\u001f\u007f]/u.test(decoded);
  }
  try {
    const url = new URL(link.url);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
  } catch { return false; }
}

export function taskLink(item: Pick<WbsItem, "id" | "title" | "link">, templateItems: WbsItem[] = []): WbsTaskLink | undefined {
  const sameTitle = templateItems.filter((entry) => entry.title.trim() === item.title.trim());
  const inherited = templateItems.find((entry) => entry.id === item.id)
    ?? (sameTitle.length === 1 ? sameTitle[0] : undefined);
  const link = item.link ?? inherited?.link;
  return link && validTaskLink(link) ? link : undefined;
}

export function taskLinkHref(link: WbsTaskLink, courseId: string) {
  return link.url.replaceAll("{courseId}", encodeURIComponent(courseId));
}
