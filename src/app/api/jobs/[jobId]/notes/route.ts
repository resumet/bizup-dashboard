import {
  parseCourseJobNoteContent,
  toCourseJobNote,
} from "@/lib/jobs/notes";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

type Context = { params: Promise<{ jobId: string }> };

export async function POST(request: Request, { params }: Context) {
  const { jobId } = await params;
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) {
    return Response.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }
  if (!user.email) {
    return Response.json(
      { message: "작성자 이메일 정보를 확인할 수 없습니다." },
      { status: 400 },
    );
  }

  try {
    const body = (await request.json()) as { content?: unknown };
    const content = parseCourseJobNoteContent(body.content);
    const { data: job } = await supabase
      .from("course_jobs")
      .select("id")
      .eq("id", jobId)
      .maybeSingle();
    if (!job) {
      return Response.json(
        { message: "작업을 찾을 수 없거나 접근 권한이 없습니다." },
        { status: 404 },
      );
    }

    const { data: note, error } = await supabase
      .from("course_job_notes")
      .insert({
        course_job_id: jobId,
        content,
        created_by: user.id,
        author_email: user.email,
      })
      .select(
        "id,content,created_by,author_email,created_at,updated_at",
      )
      .single();
    if (error || !note) {
      throw new Error(
        error?.code === "PGRST205" || error?.code === "42P01"
          ? "명단 메모 DB 마이그레이션을 먼저 적용해 주세요."
          : `메모 저장 실패: ${error?.code ?? "UNKNOWN"}`,
      );
    }

    return Response.json({ note: toCourseJobNote(note) }, { status: 201 });
  } catch (error) {
    return Response.json(
      {
        message:
          error instanceof Error ? error.message : "메모를 저장하지 못했습니다.",
      },
      { status: 400 },
    );
  }
}
