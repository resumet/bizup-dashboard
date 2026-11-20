import { notFound, redirect } from "next/navigation";
import { SalesEditor } from "@/components/post-sales/editor";
import { loadSalesEditor } from "@/lib/post-sales/server";

export default async function PostSalesEditorPage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const data = await loadSalesEditor(courseId).catch((error: unknown) => {
    if (error instanceof Error && error.message === "UNAUTHORIZED") redirect("/login");
    if (error instanceof Error && error.message === "NOT_FOUND") notFound();
    throw error;
  });
  return <SalesEditor {...data} />;
}
