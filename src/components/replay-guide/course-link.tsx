import Link from "next/link";
import { Button } from "@/components/ui/button";
import { createAdminClient } from "@/lib/supabase/admin";
import { replayPath } from "@/lib/replay-guide/model";

export async function CourseReplayLink({ courseId, workspaceId }: { courseId: string; workspaceId: string }) {
  const { data, error } = await createAdminClient().from("course_replay_guides")
    .select("token,short_url,public_enabled,has_publication,courses!inner(workspace_id)")
    .eq("course_id", courseId).eq("courses.workspace_id", workspaceId).maybeSingle();
  const href = data?.short_url || (data?.has_publication ? replayPath(data.token) : "");
  return <div className="grid min-w-0 gap-2">
    <span className="text-sm font-medium">강의 다시보기 안내문</span>
    <div className="flex flex-wrap items-center gap-2">
      {error ? <span className="text-sm text-destructive">안내 링크를 불러오지 못했습니다.</span> :
        data?.public_enabled && href ? <a href={href} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-sm text-primary underline">{href}</a>
        : <span className="text-sm text-muted-foreground">{data?.has_publication ? "공개 중지" : "미공개"}</span>}
      <Button asChild variant="outline"><Link href={`/services/course-operations/${courseId}/replay-guide`}>{data ? "안내문 편집" : "안내문 작성"}</Link></Button>
    </div>
  </div>;
}
