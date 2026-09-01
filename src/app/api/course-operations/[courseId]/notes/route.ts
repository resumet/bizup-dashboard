import {
  parseCourseNoteContent,
  toCourseNote,
} from "@/lib/course-operations/notes";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

type Context = { params: Promise<{ courseId: string }> };

export async function POST(request: Request, { params }: Context) {
  const { courseId } = await params;
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
    const content = parseCourseNoteContent(body.content);
    const { data: course } = await supabase
      .from("courses")
      .select("id")
      .eq("id", courseId)
      .maybeSingle();
    if (!course) {
      return Response.json(
        { message: "강의를 찾을 수 없거나 접근 권한이 없습니다." },
        { status: 404 },
      );
    }

    const { data: note, error } = await supabase
      .from("course_notes")
      .insert({
        course_id: courseId,
        content,
        created_by: user.id,
        author_email: user.email,
      })
      .select("id,content,created_by,author_email,created_at,updated_at")
      .single();
    if (error || !note) {
      throw new Error(
        error?.code === "PGRST205" || error?.code === "42P01"
          ? "강의 메모 DB 마이그레이션을 먼저 적용해 주세요."
          : `메모 저장 실패: ${error?.code ?? "UNKNOWN"}`,
      );
    }
    return Response.json({ note: toCourseNote(note) }, { status: 201 });
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
