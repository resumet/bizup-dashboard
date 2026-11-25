import "server-only";
import { createShortLink, ShortLinkError } from "@/lib/short-links/client";
import { POST_SALES_SHORT_LINK_TYPE } from "@/lib/short-links/types";

export async function syncPostSalesShortLink(
  page: { courseId: string; courseName: string; publicUrl: string | null },
  saveLink: (url: string) => Promise<void>,
  issue = createShortLink,
): Promise<{ shortUrl: string | null; shortLinkWarning: string | null }> {
  if (!page.publicUrl) return { shortUrl: null, shortLinkWarning: null };
  try {
    const result = await issue({
      course_id: page.courseId,
      type_key: POST_SALES_SHORT_LINK_TYPE.typeKey,
      destination_url: page.publicUrl,
      name: `${page.courseName} ${POST_SALES_SHORT_LINK_TYPE.label}`.slice(0, 120),
    });
    await saveLink(result.short_url);
    return { shortUrl: result.short_url, shortLinkWarning: null };
  } catch (error) {
    const detail = error instanceof ShortLinkError ? error.message : "짧은 주소를 강의에 저장하지 못했습니다.";
    return { shortUrl: null, shortLinkWarning: `페이지는 저장했습니다. ${detail} 다시 저장하면 링크 연결을 재시도합니다.` };
  }
}
