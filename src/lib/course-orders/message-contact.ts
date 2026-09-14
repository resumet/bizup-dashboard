import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CourseOrderError } from "./server";
import { normalizeOrderStudentPhone } from "./student-roster";

export function orderMessageBookId(courseId: string) {
  const hash = createHash("sha256").update(`course-order-messages:${courseId}`).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

export async function prepareOrderMessageContact(admin: SupabaseClient, course: { id: string; name: string; workspace_id: string }, userId: string, orderId: string) {
  if (!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/iu.test(orderId)) throw new CourseOrderError("주문 ID가 올바르지 않습니다.");
  const { data: order, error } = await admin.from("course_orders")
    .select("member_name,phone,email,status").eq("course_id", course.id).eq("id", orderId).maybeSingle();
  if (error) throw new CourseOrderError("주문을 불러오지 못했습니다.", 500);
  if (!order) throw new CourseOrderError("해당 강의의 주문을 찾을 수 없습니다.", 404);
  if (order.status.normalize("NFKC").trim() !== "결제완료") throw new CourseOrderError("결제완료인 수강생만 선택할 수 있습니다.");
  const phone = normalizeOrderStudentPhone(order.phone);
  if (!phone) throw new CourseOrderError("010-0000-0000 형식의 전화번호를 확인해 주세요.");

  const bookId = orderMessageBookId(course.id);
  const { error: bookError } = await admin.from("address_books").upsert({
    id: bookId, workspace_id: course.workspace_id, name: `${course.name} · 주문 수강생 발송`, created_by: userId,
  }, { onConflict: "id", ignoreDuplicates: true });
  if (bookError) throw new CourseOrderError("발송용 주소록을 준비하지 못했습니다.", 500);
  const { data: book, error: scopeError } = await admin.from("address_books").select("workspace_id").eq("id", bookId).single();
  if (scopeError || book?.workspace_id !== course.workspace_id) throw new CourseOrderError("발송용 주소록 권한을 확인하지 못했습니다.", 403);
  const { data: contact, error: contactError } = await admin.from("address_book_contacts").upsert({
    address_book_id: bookId, normalized_phone: phone, name: order.member_name || null, email: order.email || null, updated_at: new Date().toISOString(),
  }, { onConflict: "address_book_id,normalized_phone" }).select("id").single();
  if (contactError || !contact) throw new CourseOrderError("발송할 연락처를 준비하지 못했습니다.", 500);
  const { count, error: countError } = await admin.from("address_book_contacts").select("id", { count: "exact", head: true }).eq("address_book_id", bookId);
  if (countError || count === null) throw new CourseOrderError("발송용 주소록 인원을 확인하지 못했습니다.", 500);
  const { error: updateError } = await admin.from("address_books").update({ contact_count: count, updated_at: new Date().toISOString() }).eq("id", bookId).eq("workspace_id", course.workspace_id);
  if (updateError) throw new CourseOrderError("발송용 주소록을 갱신하지 못했습니다.", 500);
  return { bookId, contactId: contact.id as string };
}
