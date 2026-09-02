import { hasAdminAccess } from "@/lib/admin/access";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type Context = { params: Promise<{ bookId: string }> };

export async function PATCH(request: Request, { params }: Context) {
  const { bookId } = await params;
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user)
    return Response.json({ message: "로그인이 필요합니다." }, { status: 401 });

  const name = String((await request.json()).name ?? "").trim();
  if (!name) {
    return Response.json(
      { message: "주소록 이름을 입력해 주세요." },
      { status: 400 },
    );
  }
  const { error } = await supabase
    .from("address_books")
    .update({ name, updated_at: new Date().toISOString() })
    .eq("id", bookId);
  return error
    ? Response.json({ message: error.message }, { status: 400 })
    : Response.json({ message: "주소록 이름이 변경되었습니다." });
}

export async function DELETE(_: Request, { params }: Context) {
  const { bookId } = await params;
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user)
    return Response.json({ message: "로그인이 필요합니다." }, { status: 401 });

  const admin = createAdminClient();
  const { data: book, error: bookError } = await admin
    .from("address_books")
    .select("id,name,workspace_id")
    .eq("id", bookId)
    .maybeSingle();
  if (bookError) {
    return Response.json({ message: bookError.message }, { status: 400 });
  }
  if (!book) {
    return Response.json(
      { message: "삭제할 주소록을 찾을 수 없습니다." },
      { status: 404 },
    );
  }

  const { data: membership, error: membershipError } = await admin
    .from("workspace_members")
    .select("role")
    .eq("user_id", user.id)
    .eq("workspace_id", book.workspace_id)
    .limit(1)
    .maybeSingle();
  if (membershipError || !membership) {
    return Response.json(
      { message: "워크스페이스 권한이 없습니다." },
      { status: 403 },
    );
  }
  if (!hasAdminAccess(user.email, membership.role)) {
    return Response.json(
      { message: "관리자만 주소록을 삭제할 수 있습니다." },
      { status: 403 },
    );
  }

  const { data: linkedCourses, error: linkedCoursesError } = await admin
    .from("courses")
    .select("id")
    .eq("workspace_id", book.workspace_id)
    .eq("free_address_book_id", bookId);
  if (
    linkedCoursesError &&
    !["42703", "PGRST204"].includes(linkedCoursesError.code)
  ) {
    return Response.json(
      { message: `주소록 연결 정보 조회 실패: ${linkedCoursesError.code}` },
      { status: 400 },
    );
  }

  const linkedCourseIds = (linkedCourses ?? []).map((course) => course.id);
  if (linkedCourseIds.length) {
    const { error: unlinkError } = await admin
      .from("courses")
      .update({ free_address_book_id: null })
      .eq("workspace_id", book.workspace_id)
      .in("id", linkedCourseIds);
    if (unlinkError) {
      return Response.json(
        { message: `강의 연결 해제 실패: ${unlinkError.code}` },
        { status: 400 },
      );
    }
  }

  const { error: deleteError } = await admin
    .from("address_books")
    .delete()
    .eq("id", bookId)
    .eq("workspace_id", book.workspace_id);
  if (deleteError) {
    if (linkedCourseIds.length) {
      await admin
        .from("courses")
        .update({ free_address_book_id: bookId })
        .eq("workspace_id", book.workspace_id)
        .in("id", linkedCourseIds);
    }
    return Response.json({ message: deleteError.message }, { status: 400 });
  }

  await admin.from("audit_logs").insert({
    workspace_id: book.workspace_id,
    actor_id: user.id,
    event_type: "address_book.deleted",
    entity_type: "address_book",
    entity_id: bookId,
    metadata: {
      name: book.name,
      unlinked_course_count: linkedCourseIds.length,
    },
  });
  return Response.json({ message: "주소록이 삭제되었습니다." });
}
