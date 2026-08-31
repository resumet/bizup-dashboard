import { loadAllAddressBookContacts } from "@/lib/address-books/load";
import { mergeAddressBookContacts } from "@/lib/address-books/merge";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MAX_SOURCE_BOOKS = 100;
const INSERT_CHUNK_SIZE = 500;

type MergeAddressBooksBody = {
  name?: unknown;
  sourceBookIds?: unknown;
};

export async function POST(request: Request) {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) {
    return Response.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    const body = (await request.json()) as MergeAddressBooksBody;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const sourceBookIds = Array.isArray(body.sourceBookIds)
      ? Array.from(
          new Set(
            body.sourceBookIds.filter(
              (value): value is string =>
                typeof value === "string" && value.trim().length > 0,
            ),
          ),
        )
      : [];

    if (!name) {
      return Response.json(
        { message: "새 주소록 이름을 입력해 주세요." },
        { status: 400 },
      );
    }
    if (name.length > 200) {
      return Response.json(
        { message: "주소록 이름은 200자 이하로 입력해 주세요." },
        { status: 400 },
      );
    }
    if (sourceBookIds.length < 2) {
      return Response.json(
        { message: "병합할 주소록을 2개 이상 선택해 주세요." },
        { status: 400 },
      );
    }
    if (sourceBookIds.length > MAX_SOURCE_BOOKS) {
      return Response.json(
        { message: `한 번에 최대 ${MAX_SOURCE_BOOKS}개의 주소록을 병합할 수 있습니다.` },
        { status: 400 },
      );
    }

    const admin = createAdminClient();
    const { data: membership, error: membershipError } = await admin
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();
    if (membershipError || !membership) {
      return Response.json(
        { message: "워크스페이스 권한이 없습니다." },
        { status: 403 },
      );
    }

    const { data: sourceBooks, error: sourceBooksError } = await admin
      .from("address_books")
      .select("id,name")
      .eq("workspace_id", membership.workspace_id)
      .in("id", sourceBookIds);
    if (sourceBooksError) {
      throw new Error(`주소록 조회 실패: ${sourceBooksError.code}`);
    }
    if ((sourceBooks?.length ?? 0) !== sourceBookIds.length) {
      return Response.json(
        { message: "선택한 주소록 중 조회할 수 없는 항목이 있습니다." },
        { status: 404 },
      );
    }

    const contactGroups = await Promise.all(
      sourceBookIds.map((bookId) =>
        loadAllAddressBookContacts(admin, bookId),
      ),
    );
    const merged = mergeAddressBookContacts(contactGroups);
    if (merged.contacts.length === 0) {
      return Response.json(
        { message: "선택한 주소록에 병합할 연락처가 없습니다." },
        { status: 400 },
      );
    }

    const { data: newBook, error: createError } = await admin
      .from("address_books")
      .insert({
        workspace_id: membership.workspace_id,
        name,
        contact_count: merged.contacts.length,
        created_by: user.id,
      })
      .select("id")
      .single();
    if (createError || !newBook) {
      throw new Error(`새 주소록 생성 실패: ${createError?.code ?? "UNKNOWN"}`);
    }

    try {
      for (let offset = 0; offset < merged.contacts.length; offset += INSERT_CHUNK_SIZE) {
        const chunk = merged.contacts
          .slice(offset, offset + INSERT_CHUNK_SIZE)
          .map((contact) => ({
            address_book_id: newBook.id,
            normalized_phone: contact.normalized_phone,
            name: contact.name,
            email: contact.email,
          }));
        const { error: insertError } = await admin
          .from("address_book_contacts")
          .insert(chunk);
        if (insertError) {
          throw new Error(`연락처 병합 실패: ${insertError.code}`);
        }
      }
    } catch (error) {
      await admin.from("address_books").delete().eq("id", newBook.id);
      throw error;
    }

    await admin.from("audit_logs").insert({
      workspace_id: membership.workspace_id,
      actor_id: user.id,
      event_type: "address_book.merged",
      entity_type: "address_book",
      entity_id: newBook.id,
      metadata: {
        source_book_ids: sourceBookIds,
        source_contact_count: merged.sourceContactCount,
        contact_count: merged.contacts.length,
        duplicate_count: merged.duplicateCount,
      },
    });

    return Response.json(
      {
        id: newBook.id,
        contactCount: merged.contacts.length,
        duplicateCount: merged.duplicateCount,
      },
      { status: 201 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "주소록 병합에 실패했습니다.";
    return Response.json({ message }, { status: 500 });
  }
}
