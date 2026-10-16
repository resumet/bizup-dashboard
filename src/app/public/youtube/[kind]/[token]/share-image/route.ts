import { courseShareImage, unavailableShareImage } from "@/lib/course-documents/public-share";
import { getPublicYoutubeShare } from "@/lib/youtube-management/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ kind: string; token: string }> }) {
  try {
    const { kind, token } = await params;
    if (kind !== "brief" && kind !== "schedule") return unavailableShareImage();
    const { admin, course } = await getPublicYoutubeShare(token, kind);
    return await courseShareImage(admin, course.banner_image_path);
  } catch {
    return unavailableShareImage();
  }
}
