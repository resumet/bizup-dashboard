import {
  parseCourseNoteContent,
  toCourseNote,
} from "@/lib/course-operations/notes";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

type Context = {
  params: Promise<{ courseId: string; noteId: string }>;
};

async function loadOwnedNote(
  supabase: Awaited<ReturnType<typeof createClient>>,
  courseId: string,
  noteId: string,
  userId: string,
) {
  return supabase
    .from("course_notes")
    .select("id,created_by")
    .eq("id", noteId)
    .eq("course_id", courseId)
    .eq("created_by", userId)
    .maybeSingle();
}

export async function PATCH(request: Request, { params }: Context) {
  const { courseId, noteId } = await params;
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) {
    return Response.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { content?: unknown };
    const content = parseCourseNoteContent(body.content);
    const { data: ownedNote, error: loadError } = await loadOwnedNote(
      supabase,
      courseId,
      noteId,
      user.id,
    );
    if (loadError || !ownedNote) {
      return Response.json(
        { message: "본인이 작성한 메모만 수정할 수 있습니다." },
        { status: 403 },
      );
    }

    const { data: note, error } = await supabase
      .from("course_notes")
      .update({ content, updated_at: new Date().toISOString() })
      .eq("id", noteId)
      .eq("course_id", courseId)
      .eq("created_by", user.id)
      .select("id,content,created_by,author_email,created_at,updated_at")
      .single();
    if (error || !note) {
      throw new Error(`메모 수정 실패: ${error?.code ?? "UNKNOWN"}`);
    }
    return Response.json({ note: toCourseNote(note) });
  } catch (error) {
    return Response.json(
      {
        message:
          error instanceof Error ? error.message : "메모를 수정하지 못했습니다.",
      },
      { status: 400 },
    );
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  const { courseId, noteId } = await params;
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) {
    return Response.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    const { data: ownedNote, error: loadError } = await loadOwnedNote(
      supabase,
      courseId,
      noteId,
      user.id,
    );
    if (loadError || !ownedNote) {
      return Response.json(
        { message: "본인이 작성한 메모만 삭제할 수 있습니다." },
        { status: 403 },
      );
    }

    const { error } = await supabase
      .from("course_notes")
      .delete()
      .eq("id", noteId)
      .eq("course_id", courseId)
      .eq("created_by", user.id);
    if (error) throw new Error(`메모 삭제 실패: ${error.code}`);
    return Response.json({ id: noteId });
  } catch (error) {
    return Response.json(
      {
        message:
          error instanceof Error ? error.message : "메모를 삭제하지 못했습니다.",
      },
      { status: 400 },
    );
  }
}
