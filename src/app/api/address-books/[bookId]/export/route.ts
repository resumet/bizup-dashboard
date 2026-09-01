import { buildAddressBookXlsx } from "@/lib/address-books/export-xlsx";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

type Props = {
  params: Promise<{ bookId: string }>;
};

const PAGE_SIZE = 1_000;

function safeFilename(value: string) {
  return `${value || "주소록"}-연락처.xlsx`.replace(/[\\/:*?"<>|]/gu, "_");
}

function contentDisposition(filename: string) {
  return `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export async function GET(_request: Request, { params }: Props) {
  const { bookId } = await params;
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) {
    return Response.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  const { data: book, error: bookError } = await supabase
    .from("address_books")
    .select("id,name")
    .eq("id", bookId)
    .maybeSingle();
  if (bookError) {
    return Response.json({ message: bookError.message }, { status: 500 });
  }
  if (!book) {
    return Response.json({ message: "주소록을 찾을 수 없습니다." }, { status: 404 });
  }

  const contacts: Array<{
    name: string | null;
    normalized_phone: string;
    email: string | null;
  }> = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("address_book_contacts")
      .select("name,normalized_phone,email")
      .eq("address_book_id", bookId)
      .order("name")
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) {
      return Response.json({ message: error.message }, { status: 500 });
    }

    contacts.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }

  const buffer = await buildAddressBookXlsx(contacts);
  const filename = safeFilename(book.name);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Disposition": contentDisposition(filename),
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "X-Contact-Count": String(contacts.length),
    },
  });
}
