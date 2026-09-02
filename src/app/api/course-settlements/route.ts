import {
  authorizeCourseSettlement,
  loadSettlementState,
  settlementError,
} from "@/lib/course-settlements/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

async function currentUser() {
  const supabase = await createClient();
  return getAuthenticatedUser(supabase);
}

export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) {
    return Response.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    const courseId = new URL(request.url).searchParams.get("courseId") ?? "";
    if (!courseId) throw new Error("강의 ID가 필요합니다.");
    const { admin, workspaceId } = await authorizeCourseSettlement(
      courseId,
      user.id,
    );
    const { data, error } = await admin
      .from("course_settlement_projects")
      .select("*")
      .eq("course_id", courseId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (error) {
      throw new Error(
        error.code === "PGRST205" || error.code === "42703"
          ? "강의별 정산 DB 마이그레이션을 먼저 적용해 주세요."
          : `정산 조회 실패: ${error.code}`,
      );
    }
    if (!data) return Response.json({ state: null });
    return Response.json({ state: await loadSettlementState(admin, data) });
  } catch (error) {
    return settlementError(error);
  }
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) {
    return Response.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      courseId?: string;
      managerName?: string;
    };
    if (!body.courseId) throw new Error("강의 ID가 필요합니다.");
    const { admin, workspaceId, course } = await authorizeCourseSettlement(
      body.courseId,
      user.id,
    );
    const existing = await admin
      .from("course_settlement_projects")
      .select("*")
      .eq("course_id", course.id)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (existing.error) throw new Error(`정산 조회 실패: ${existing.error.code}`);

    let settlement = existing.data;
    if (!settlement) {
      const { data, error } = await admin
        .from("course_settlement_projects")
        .insert({
          workspace_id: workspaceId,
          course_id: course.id,
          name: `${course.name} 정산`,
          starts_on: course.starts_at
            ? String(course.starts_at).slice(0, 10)
            : null,
          manager_name: String(body.managerName ?? "").trim().slice(0, 100),
          created_by: user.id,
        })
        .select("*")
        .single();
      if (error || !data) {
        throw new Error(
          error?.code === "PGRST205" || error?.code === "42703"
            ? "강의별 정산 DB 마이그레이션을 먼저 적용해 주세요."
            : `정산 생성 실패: ${error?.code}`,
        );
      }
      settlement = data;
      await admin.from("audit_logs").insert({
        workspace_id: workspaceId,
        actor_id: user.id,
        event_type: "course_settlement.created",
        entity_type: "course_settlement",
        entity_id: settlement.id,
        metadata: { course_id: course.id },
      });
    }

    return Response.json(
      { state: await loadSettlementState(admin, settlement) },
      { status: existing.data ? 200 : 201 },
    );
  } catch (error) {
    return settlementError(error);
  }
}
