import { redirect } from "next/navigation";

export default async function Page({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  redirect(`/services/content-management/${encodeURIComponent(courseId)}?tab=instagram`);
}
