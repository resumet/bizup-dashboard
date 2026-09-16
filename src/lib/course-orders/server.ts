import "server-only";

import { createHash } from "node:crypto";
import { readSheet } from "read-excel-file/node";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { courseOrderIdentity, parseCourseOrders } from "./parse";
import type { CourseOrder, CourseOrdersResponse, SavedCourseOrder } from "./types";

export class CourseOrderError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

export async function authorizeCourseOrders(courseId: string) {
  const user = await getAuthenticatedUser(await createClient());
  if (!user) throw new CourseOrderError("로그인이 필요합니다.", 401);
  if (!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/iu.test(courseId)) throw new CourseOrderError("강의 ID가 올바르지 않습니다.");
  const admin = createAdminClient();
  const { data: course, error } = await admin.from("courses").select("id,name,workspace_id").eq("id", courseId).maybeSingle();
  if (error) throw new CourseOrderError("강의를 조회하지 못했습니다.", 500);
  if (!course) throw new CourseOrderError("강의를 찾을 수 없습니다.", 404);
  const { data: member, error: memberError } = await admin.from("workspace_members").select("user_id").eq("workspace_id", course.workspace_id).eq("user_id", user.id).maybeSingle();
  if (memberError) throw new CourseOrderError("강의 권한을 확인하지 못했습니다.", 500);
  if (!member) throw new CourseOrderError("주문 내역을 관리할 권한이 없습니다.", 403);
  return { admin, user, course };
}

export async function readCourseOrderUpload(form: FormData) {
  const file = form.get("file");
  if (!(file instanceof File) || !/\.xlsx$/iu.test(file.name)) throw new CourseOrderError("주문결제 목록 .xlsx 파일을 선택해 주세요.");
  if (!file.size || file.size > 4 * 1024 * 1024) throw new CourseOrderError("파일은 4MB 이하의 비어 있지 않은 엑셀이어야 합니다.");
  let matrix: unknown[][];
  try { matrix = await readSheet(Buffer.from(await file.arrayBuffer()), 1) as unknown[][]; }
  catch { throw new CourseOrderError("엑셀 파일을 읽지 못했습니다. 파일 형식을 확인해 주세요."); }
  return { fileName: file.name.slice(0, 255), rows: parseCourseOrders(matrix) };
}

function databaseError(code: string) {
  return new CourseOrderError(
    ["PGRST205", "42P01", "PGRST202"].includes(code)
      ? "주문 내역 DB 마이그레이션(202609120001_course_orders.sql)을 먼저 적용해 주세요."
      : `주문 내역 처리에 실패했습니다. (${code})`,
    500,
  );
}

export function toOrderRecord(row: CourseOrder) {
  return {
    record_key: createHash("sha256").update(courseOrderIdentity(row)).digest("hex"),
    product_name: row.productName, option_name: row.optionName, member_name: row.memberName,
    phone: row.phone, email: row.email, payment_amount: row.paymentAmount,
    refund_amount: row.refundAmount, current_amount: row.currentAmount, status: row.status,
    payment_method: row.paymentMethod, rs: row.rs, ad_media: row.adMedia, inflow_type: row.inflowType,
    payment_id: row.paymentId, order_id: row.orderId, refund_date: row.refundDate || null,
  };
}

export async function saveCourseOrders(admin: ReturnType<typeof createAdminClient>, courseId: string, userId: string, fileName: string, rows: CourseOrder[]) {
  const { data: importId, error } = await admin.rpc("import_course_orders", {
    p_course_id: courseId, p_actor_id: userId, p_file_name: fileName, p_rows: rows.map(toOrderRecord),
  });
  if (error) throw databaseError(error.code);
  if (typeof importId !== "string") throw new CourseOrderError("주문 가져오기 결과를 확인하지 못했습니다.", 500);

  // Rows touched by this upload now reference its import. Remove untouched rows so
  // the selected rows in the latest workbook are the course's source of truth.
  const { error: cleanupError } = await admin.from("course_orders").delete()
    .eq("course_id", courseId).neq("import_id", importId);
  if (cleanupError) throw new CourseOrderError(`이전 주문 정리에 실패했습니다. (${cleanupError.code})`, 500);
}

export async function loadCourseOrders(admin: ReturnType<typeof createAdminClient>, courseId: string): Promise<CourseOrdersResponse> {
  const orders: SavedCourseOrder[] = [];
  // PostgREST caps a response at 1,000 rows; read every page before filtering.
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await admin.from("course_orders").select("*").eq("course_id", courseId)
      .order("id").range(offset, offset + 999);
    if (error) throw databaseError(error.code);
    for (const row of data ?? []) orders.push({
      id: row.id, productName: row.product_name, optionName: row.option_name,
      memberName: row.member_name, phone: row.phone, email: row.email,
      paymentAmount: Number(row.payment_amount), refundAmount: Number(row.refund_amount), currentAmount: Number(row.current_amount),
      status: row.status, paymentMethod: row.payment_method, rs: row.rs, adMedia: row.ad_media,
      inflowType: row.inflow_type, paymentId: row.payment_id, orderId: row.order_id,
      refundDate: row.refund_date ?? "", updatedAt: row.updated_at,
    });
    if (!data || data.length < 1000) break;
  }
  const { data: imports, error } = await admin.from("course_order_imports").select("id,file_name,row_count,created_at")
    .eq("course_id", courseId).order("created_at", { ascending: false }).limit(10);
  if (error) throw databaseError(error.code);
  return {
    orders: orders.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id)),
    imports: (imports ?? []).map((item) => ({ id: item.id, fileName: item.file_name, rowCount: item.row_count, createdAt: item.created_at })),
  };
}

export function courseOrderErrorResponse(error: unknown) {
  return Response.json({ message: error instanceof Error ? error.message : "주문 내역을 처리하지 못했습니다." },
    { status: error instanceof CourseOrderError ? error.status : 400, headers: { "Cache-Control": "no-store" } });
}
