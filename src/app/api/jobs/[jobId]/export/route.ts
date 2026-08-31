import { buildRosterXlsx } from "@/lib/jobs/export-xlsx";
import { filterRosterRows } from "@/lib/jobs/filter";
import { loadJobRoster } from "@/lib/jobs/server";
import { EMPTY_ROSTER_FILTERS, type RosterFilters } from "@/lib/jobs/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type Context = { params: Promise<{ jobId: string }> };

export async function POST(request: Request, { params }: Context) {
  const { jobId } = await params;
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) return Response.json({ message: "로그인이 필요합니다." }, { status: 401 });

  try {
    const body = await request.json() as { scope?: string; filters?: Partial<RosterFilters>; selectedIds?: string[] };
    const { job, rows } = await loadJobRoster(supabase, jobId);
    const filters: RosterFilters = { ...EMPTY_ROSTER_FILTERS, ...body.filters };
    const selectedIds = new Set(Array.isArray(body.selectedIds) ? body.selectedIds : []);
    const exportRows = body.scope === "selected"
      ? rows.filter((row) => selectedIds.has(row.id))
      : filterRosterRows(rows, filters);
    if (exportRows.length === 0) return Response.json({ message: "내보낼 대상이 없습니다." }, { status: 400 });

    const buffer = await buildRosterXlsx(exportRows, job.default_course_name || "");
    const filename = `${job.name}-${body.scope === "selected" ? "선택" : "필터"}.xlsx`;
    await createAdminClient().from("audit_logs").insert({ workspace_id: job.workspace_id, actor_id: user.id, event_type: "course_job.exported", entity_type: "course_job", entity_id: job.id, metadata: { row_count: exportRows.length, scope: body.scope === "selected" ? "selected" : "filtered" } });
    return new Response(Buffer.from(buffer), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`, "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ message: error instanceof Error ? error.message : "엑셀 생성에 실패했습니다." }, { status: 400 });
  }
}
