import { hasAdminAccess } from "@/lib/admin/access";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type Context = { params: Promise<{ jobId: string }> };

export async function DELETE(_: Request, { params }: Context) {
  const { jobId } = await params;
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) return Response.json({ message: "로그인이 필요합니다." }, { status: 401 });

  const admin = createAdminClient();
  const { data: job } = await admin.from("course_jobs").select("id,workspace_id,name").eq("id", jobId).maybeSingle();
  if (!job) return Response.json({ message: "삭제할 작업을 찾을 수 없습니다." }, { status: 404 });
  const { data: membership } = await admin.from("workspace_members").select("role").eq("workspace_id", job.workspace_id).eq("user_id", user.id).maybeSingle();
  if (!hasAdminAccess(user.email, membership?.role)) return Response.json({ message: "관리자만 작업을 삭제할 수 있습니다." }, { status: 403 });

  const { data: versions } = await admin.from("job_file_versions").select("storage_path").eq("job_id", job.id);
  const { error: deleteError } = await admin.from("course_jobs").delete().eq("id", job.id);
  if (deleteError) return Response.json({ message: `작업 삭제 실패: ${deleteError.code}` }, { status: 400 });

  const storagePaths = (versions ?? []).map((version) => version.storage_path);
  const storageResult = storagePaths.length > 0 ? await admin.storage.from("course-files").remove(storagePaths) : { error: null };
  await admin.from("audit_logs").insert({ workspace_id: job.workspace_id, actor_id: user.id, event_type: "course_job.deleted", entity_type: "course_job", entity_id: job.id, metadata: { name: job.name, storage_cleanup_succeeded: !storageResult.error } });
  return Response.json({ message: storageResult.error ? "작업은 삭제됐지만 원본 파일 정리가 필요합니다." : "작업이 삭제되었습니다.", warning: Boolean(storageResult.error) });
}
