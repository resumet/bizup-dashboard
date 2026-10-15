import { courseShareImage, getPublishedCourseDocument, unavailableShareImage } from "@/lib/course-documents/public-share";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const result = await getPublishedCourseDocument(slug);
    if (!result) return unavailableShareImage();
    return await courseShareImage(result.admin, result.course.banner_image_path);
  } catch { return unavailableShareImage(); }
}
