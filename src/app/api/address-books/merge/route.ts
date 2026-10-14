import { loadAllAddressBookContacts } from "@/lib/address-books/load";
import { mergeAddressBookContacts } from "@/lib/address-books/merge";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import { loadJobEnrollmentRows } from "@/lib/jobs/server";
import { paidRosterStudents } from "@/lib/course-orders/paid-student-share";
import { requireCourseOperationsMembership } from "@/lib/course-operations/server";
import { isProtectedAddressBook } from "@/lib/address-books/protected-book";
import { paidExclusionRostersQuery } from "@/lib/address-books/paid-rosters";

export const runtime = "nodejs";

const INSERT_CHUNK_SIZE = 500;

const mergeSchema = z.object({
  name: z.string().trim().min(1).max(200),
  sourceBookIds: z.array(z.uuid()).min(1).max(3),
  callSalesOnly: z.boolean().default(false),
  mode: z.enum(["union", "subtract"]).default("union"),
  exclusion: z.object({ kind: z.literal("roster"), id: z.uuid() }).optional(),
}).superRefine((value, context) => {
  if (new Set(value.sourceBookIds).size !== value.sourceBookIds.length
    || (value.mode === "union" && (value.sourceBookIds.length < 2 || value.exclusion))
    || (value.mode === "subtract" && !value.exclusion)) {
    context.addIssue({ code: "custom", message: "주소록 선택을 확인해 주세요." });
  }
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) {
    return Response.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    const parsed = mergeSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({
      message: "새 주소록 이름(200자 이하)과 명단 선택을 확인해 주세요. 합치기는 2~3개, 제외하기는 1~3개의 주소록과 강의에 저장된 유료수강생 명단 1개가 필요합니다.",
    }, { status: 400 });
    const { name, sourceBookIds, callSalesOnly, mode, exclusion } = parsed.data;
    if (isProtectedAddressBook({ name })) return Response.json({ message: "전체 명단은 고정 주소록 이름입니다. 다른 이름을 입력해 주세요." }, { status: 400 });

    const admin = createAdminClient();
    const membership = await requireCourseOperationsMembership(user.id).catch(() => null);
    if (!membership) {
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

    // Authorize the exclusion roster before reading any enrollment data with admin privileges.
    let roster: { id: string; latest_version: number } | null = null;
    if (exclusion?.kind === "roster") {
      const { data, error } = await paidExclusionRostersQuery(admin, membership.workspace_id, exclusion.id).maybeSingle();
      if (error) throw new Error(`제외 명단 조회 실패: ${error.code}`);
      if (!data) return Response.json({ message: "강의에 저장된 유료수강생 명단을 찾을 수 없습니다. 목록을 새로고침해 주세요." }, { status: 404 });
      roster = data;
    }
    const [contactGroups, excludedPhones] = await Promise.all([Promise.all(
      sourceBookIds.map((bookId) =>
        loadAllAddressBookContacts(admin, bookId),
      ),
    ), roster
        ? loadJobEnrollmentRows(admin, roster.id, roster.latest_version).then(rows => paidRosterStudents(rows).map(student => student.phone))
        : Promise.resolve([])]);
    const merged = mergeAddressBookContacts(contactGroups, { callSalesOnly, excludedPhones });
    if (merged.contacts.length === 0 && merged.excludedContacts.length === 0 && merged.matchedExclusionCount === 0) {
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
        mode,
        exclusion: exclusion ?? null,
        matched_exclusion_count: merged.matchedExclusionCount,
      },
    });

    return Response.json(
      {
        id: newBook.id,
        contactCount: merged.contacts.length,
        duplicateCount: merged.duplicateCount,
        matchedExclusionCount: merged.matchedExclusionCount,
        excludedCount: merged.excludedContacts.length,
        excludedContacts: merged.excludedContacts.map(({ sourceGroupIndex, ...contact }) => ({
          ...contact,
          sourceBookId: sourceBookIds[sourceGroupIndex],
          sourceBookName: sourceBooks!.find((book) => book.id === sourceBookIds[sourceGroupIndex])!.name,
        })),
      },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "주소록 병합에 실패했습니다.";
    return Response.json({ message }, { status: 500 });
  }
}
