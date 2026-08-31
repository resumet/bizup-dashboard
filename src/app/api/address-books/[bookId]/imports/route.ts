import { parseAddressBookFile } from "@/lib/address-books/parse";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

type Context = { params: Promise<{ bookId: string }> };
export const runtime = "nodejs";

export async function POST(request: Request, { params }: Context) {
  const { bookId } = await params;
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user)
    return Response.json({ message: "로그인이 필요합니다." }, { status: 401 });

  try {
    const { data: book } = await supabase
      .from("address_books")
      .select("id")
      .eq("id", bookId)
      .maybeSingle();
    if (!book) {
      return Response.json(
        { message: "주소록을 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json(
        { message: "파일을 선택해 주세요." },
        { status: 400 },
      );
    }

    const parsed = await parseAddressBookFile(
      new Uint8Array(await file.arrayBuffer()),
      file.name,
    );
    const admin = createAdminClient();
    const { error } = await admin.from("address_book_contacts").upsert(
      parsed.contacts.map((contact) => ({
        address_book_id: bookId,
        normalized_phone: contact.normalizedPhone,
        name: contact.name || null,
        email: contact.email || null,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: "address_book_id,normalized_phone" },
    );
    if (error) throw new Error(`연락처 업데이트 실패: ${error.code}`);

    const { count } = await admin
      .from("address_book_contacts")
      .select("id", { count: "exact", head: true })
      .eq("address_book_id", bookId);
    await admin
      .from("address_books")
      .update({
        contact_count: count ?? 0,
        updated_at: new Date().toISOString(),
      })
      .eq("id", bookId);
    await admin.from("address_book_imports").insert({
      address_book_id: bookId,
      original_filename: file.name,
      total_rows: parsed.totalRows,
      imported_rows: parsed.contacts.length,
      skipped_rows: parsed.skippedRows,
      uploaded_by: user.id,
    });

    return Response.json({
      importedCount: parsed.contacts.length,
      skippedCount: parsed.skippedRows,
      totalCount: count ?? 0,
    });
  } catch (error) {
    return Response.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "주소록 업데이트에 실패했습니다.",
      },
      { status: 400 },
    );
  }
}
