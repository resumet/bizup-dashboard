import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { paidExclusionRostersQuery } from "@/lib/address-books/paid-rosters";
import { rosterIncludesContact, type ContactCourse } from "@/lib/address-books/contact-courses";
import { loadJobEnrollmentRows } from "@/lib/jobs/server";

export const runtime = "nodejs";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

export async function GET(_request: Request, { params }: { params: Promise<{ bookId: string; contactId: string }> }) {
  try {
    const client = await createClient();
    const user = await getAuthenticatedUser(client);
    if (!user) return json({ message: "로그인이 필요합니다." }, 401);
    const input = z.object({ bookId: z.uuid(), contactId: z.uuid() }).safeParse(await params);
    if (!input.success) return json({ message: "연락처를 확인해 주세요." }, 400);
    const { bookId, contactId } = input.data;
    const admin = createAdminClient();
    const { data: book, error: bookError } = await admin.from("address_books").select("workspace_id").eq("id", bookId).maybeSingle();
    if (bookError) throw bookError;
    if (!book) return json({ message: "주소록을 찾을 수 없습니다." }, 404);
    const { data: membership, error: membershipError } = await admin.from("workspace_members").select("workspace_id")
      .eq("workspace_id", book.workspace_id).eq("user_id", user.id).maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership) return json({ message: "워크스페이스 권한이 없습니다." }, 403);
    const { data: contact, error: contactError } = await admin.from("address_book_contacts").select("normalized_phone")
      .eq("id", contactId).eq("address_book_id", bookId).maybeSingle();
    if (contactError) throw contactError;
    if (!contact) return json({ message: "연락처를 찾을 수 없습니다." }, 404);
    const courses = new Map<string, ContactCourse>();
    for (let start = 0; ; start += 1000) {
      const { data, error } = await paidExclusionRostersQuery(admin, book.workspace_id).order("id").range(start, start + 999);
      if (error) throw error;
      const rosters = data ?? [];
      // Bound concurrent reads; each roster is paged and limited to its latest saved version.
      for (let offset = 0; offset < rosters.length; offset += 4) {
        const matches = await Promise.all(rosters.slice(offset, offset + 4).map(async roster => {
          const rows = await loadJobEnrollmentRows(admin, roster.id, roster.latest_version);
          return rosterIncludesContact(rows, contact.normalized_phone ?? "") ? roster.course : null;
        }));
        for (const course of matches) if (course) courses.set(course.id, {
          id: course.id, name: course.name, cohort: course.cohort, instructorName: course.instructor_name,
        });
      }
      if (rosters.length < 1000) break;
    }
    return json({ courses: [...courses.values()].sort((a, b) => a.name.localeCompare(b.name, "ko-KR") || (a.cohort ?? "").localeCompare(b.cohort ?? "", "ko-KR", { numeric: true })) });
  } catch {
    return json({ message: "수강 강의를 불러오지 못했습니다. 다시 시도해 주세요." }, 500);
  }
}
