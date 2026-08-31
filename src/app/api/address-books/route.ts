import { parseAddressBookFile } from "@/lib/address-books/parse";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await createClient(); const user = await getAuthenticatedUser(supabase);
  if (!user) return Response.json({ message: "로그인이 필요합니다." }, { status: 401 });
  try {
    const form = await request.formData(); const file = form.get("file"); const name = String(form.get("name") ?? "").trim();
    if (!(file instanceof File) || !name) return Response.json({ message: "주소록 이름과 Excel/CSV 파일을 입력해 주세요." }, { status: 400 });
    const admin = createAdminClient(); const { data: membership } = await admin.from("workspace_members").select("workspace_id").eq("user_id", user.id).limit(1).single();
    if (!membership) return Response.json({ message: "워크스페이스 권한이 없습니다." }, { status: 403 });
    const parsed = await parseAddressBookFile(new Uint8Array(await file.arrayBuffer()), file.name);
    if (parsed.contacts.length === 0) return Response.json({ message: "유효한 전화번호가 있는 행이 없습니다." }, { status: 400 });
    const { data: book, error: bookError } = await admin.from("address_books").insert({ workspace_id: membership.workspace_id, name, contact_count: parsed.contacts.length, created_by: user.id }).select("id").single();
    if (bookError) throw new Error(bookError.code === "PGRST205" ? "주소록 DB 마이그레이션을 먼저 적용해 주세요." : `주소록 생성 실패: ${bookError.code}`);
    const { error: contactsError } = await admin.from("address_book_contacts").insert(parsed.contacts.map((contact) => ({ address_book_id: book.id, normalized_phone: contact.normalizedPhone, name: contact.name || null, email: contact.email || null })));
    if (contactsError) { await admin.from("address_books").delete().eq("id", book.id); throw new Error(`연락처 저장 실패: ${contactsError.code}`); }
    await admin.from("address_book_imports").insert({ address_book_id: book.id, original_filename: file.name, total_rows: parsed.totalRows, imported_rows: parsed.contacts.length, skipped_rows: parsed.skippedRows, uploaded_by: user.id });
    return Response.json({ id: book.id, importedCount: parsed.contacts.length, skippedCount: parsed.skippedRows }, { status: 201 });
  } catch (error) { return Response.json({ message: error instanceof Error ? error.message : "주소록 생성에 실패했습니다." }, { status: 400 }); }
}
