import { NextResponse, type NextRequest } from "next/server";

import {
  COURSE_INTAKE_COOKIE,
  isSameOriginRequest,
  verifyCourseIntakeToken,
} from "@/lib/course-intake/auth";
import { getCourseIntakeConfig } from "@/lib/course-intake/config";
import { parseCourseIntakeInput } from "@/lib/course-intake/validation";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let courseId = "";
  try {
    if (!isSameOriginRequest(request)) {
      return NextResponse.json({ message: "허용되지 않은 요청입니다." }, { status: 403 });
    }
    const config = getCourseIntakeConfig();
    const token = request.cookies.get(COURSE_INTAKE_COOKIE)?.value;
    if (!verifyCourseIntakeToken(token, config.sessionSecret)) {
      return NextResponse.json({ message: "다시 로그인해 주세요." }, { status: 401 });
    }
    const input = parseCourseIntakeInput(await request.json());
    const admin = createAdminClient();
    const { data: membership, error: membershipError } = await admin
      .from("workspace_members")
      .select("workspace_id,user_id")
      .eq("workspace_id", config.workspaceId)
      .eq("user_id", config.createdByUserId)
      .maybeSingle();
    if (membershipError || !membership) {
      throw new Error("설정된 사용자에게 대상 워크스페이스 권한이 없습니다.");
    }

    const { data: course, error: courseError } = await admin
      .from("courses")
      .insert({
        workspace_id: config.workspaceId,
        name: input.courseName,
        instructor_name: input.instructorName,
        free_webinar_at: input.freeWebinarAt,
        starts_at: input.startsAt,
        early_bird_event: "",
        first_50_event: "",
        created_by: config.createdByUserId,
      })
      .select("id")
      .single();
    if (courseError) throw new Error(`강의 생성 실패: ${courseError.code}`);
    courseId = course.id;

    const { error: optionError } = await admin.from("course_options").insert({
      course_id: course.id,
      name: "기본반",
      list_price: 0,
      sale_price: 0,
      sort_order: 0,
    });
    if (optionError) throw new Error(`기본 옵션 생성 실패: ${optionError.code}`);

    await admin.from("audit_logs").insert({
      workspace_id: config.workspaceId,
      actor_id: config.createdByUserId,
      event_type: "course_intake.course_created",
      entity_type: "course",
      entity_id: course.id,
      metadata: { name: input.courseName, source: "password_intake" },
    });
    return NextResponse.json({ id: course.id }, { status: 201 });
  } catch (error) {
    if (courseId) {
      await createAdminClient().from("courses").delete().eq("id", courseId);
    }
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "강의를 생성하지 못했습니다.",
      },
      { status: 400 },
    );
  }
}
