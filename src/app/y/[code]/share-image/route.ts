import { courseShareImage, unavailableShareImage } from "@/lib/course-documents/public-share";
import { getPublicYoutubeShare, resolvePublicYoutubeShortShare } from "@/lib/youtube-management/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const { kind, token } = await resolvePublicYoutubeShortShare(code);
    const { admin, course } = await getPublicYoutubeShare(token, kind);
    return await courseShareImage(admin, course.banner_image_path);
  } catch {
    return unavailableShareImage();
  }
}
