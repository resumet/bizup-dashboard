import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { loadWbsCourseSavedLink, requireWbsContext } from "@/lib/course-wbs/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { courseLinkLabel } from "@/lib/course-wbs/course-links";
import { parseWbsCourseId, WbsInputError } from "@/lib/course-wbs/validation";

export default async function WbsSavedCourseLinkPage({ params, searchParams }: {
  params: Promise<{ courseId: string }>; searchParams: Promise<{ key?: string }>;
}) {
  const user = await getAuthenticatedUser(await createClient());
  if (!user) redirect("/login");
  const { workspaceId } = await requireWbsContext();
  const { courseId } = await params;
  const { key = "" } = await searchParams;
  if (!courseLinkLabel(key) || key.length > 500) notFound();
  try { parseWbsCourseId(courseId); } catch (error) { if (error instanceof WbsInputError) notFound(); throw error; }
  const result = await loadWbsCourseSavedLink(workspaceId, courseId, key);
  if (!result) notFound();
  if (result.url) redirect(result.url);
  return <main className="mx-auto max-w-xl space-y-5 px-5 py-16">
    <h1 className="text-xl font-semibold">저장된 링크가 없습니다</h1>
    <p className="text-sm text-muted-foreground">이 강의의 ‘{result.label}’ 주소를 확인해 주세요. 링크가 비어 있거나, 유효한 http(s) 주소가 아니거나, 같은 이름의 커스텀 링크가 여러 개일 수 있습니다.</p>
    <Button asChild><Link href={`/services/course-operations/${encodeURIComponent(courseId)}`}>강의 링크 설정</Link></Button>
  </main>;
}
