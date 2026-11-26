import { notFound, redirect } from "next/navigation";
import { GuideEditor } from "@/components/replay-guide/editor";
import { loadGuideEditor } from "@/lib/replay-guide/server";

export default async function ReplayGuideEditorPage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const initial = await loadGuideEditor(courseId).catch((error: unknown) => {
    if (error instanceof Error && error.message === "UNAUTHORIZED") redirect("/login");
    if (error instanceof Error && error.message === "NOT_FOUND") notFound();
    throw error;
  });
  return <GuideEditor {...initial} />;
}
