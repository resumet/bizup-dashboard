import { getExternalCourse } from "@/lib/course-documents/server";
import { courseShareImage, unavailableShareImage } from "@/lib/course-documents/public-share";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ accessToken: string }> }) {
  try {
    const { accessToken } = await params;
    const { admin, course } = await getExternalCourse(accessToken);
    return await courseShareImage(admin, course.banner_image_path);
  } catch { return unavailableShareImage(); }
}
