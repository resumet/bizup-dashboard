import { uploadCoursePageImage } from "@/lib/course-documents/page-image-upload";

export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ courseId: string }> }) {
  return uploadCoursePageImage(request, (await params).courseId, "post-sales");
}
