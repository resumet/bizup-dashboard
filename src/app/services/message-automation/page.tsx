import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, History } from "lucide-react";

import { MessageAutomationManager } from "@/components/address-books/message-automation-manager";
import { Button } from "@/components/ui/button";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

type Props = {
  searchParams: Promise<{
    bookId?: string;
    contactId?: string;
    templateId?: string;
    selectionKey?: string;
    courseId?: string;
  }>;
};

export default async function MessageAutomationPage({ searchParams }: Props) {
  const query = await searchParams;
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) redirect("/login");
  const contactPromise =
    query.bookId && query.contactId
      ? supabase
          .from("address_book_contacts")
          .select("id,address_book_id,name,email,normalized_phone")
          .eq("id", query.contactId)
          .eq("address_book_id", query.bookId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null });
  const [booksResult, templatesResult, coursesResult, contactResult, rostersResult] =
    await Promise.all([
      supabase
        .from("address_books")
        .select("id,name,contact_count,updated_at")
        .order("updated_at", { ascending: false }),
      supabase
        .from("message_templates")
        .select(
          "id,name,template_code,send_type,applicant_variable,course_variable,variable_names,is_system",
        )
        .order("is_system", { ascending: false }),
      supabase
        .from("courses")
        .select(
          "id,name,instructor_name,free_address_book_id,landing_page_link,custom_links,free_kakao_room_1_link,free_kakao_room_2_link,paid_kakao_room_link,communication_room_link,payment_link,inquiry_link,curriculum_link,free_gift_link,course_viewing_link",
        )
        .order("updated_at", { ascending: false }),
      contactPromise,
      supabase.from("course_jobs")
        .select("id,name,course_id,valid_count,latest_version,status,updated_at")
        .order("updated_at", { ascending: false }),
    ]);
  return (
    <main className="min-h-screen">
      <header className="border-b">
        <div className="mx-auto flex h-18 max-w-[1600px] items-center px-5 lg:px-8">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/">
              <ArrowLeft />
              서비스
            </Link>
          </Button>
          <div className="mx-3 h-5 w-px bg-border" />
          <span className="font-semibold">알림톡·문자 자동화</span>
          <Button variant="outline" size="sm" className="ml-auto" asChild>
            <Link href="/services/message-automation/history">
              <History />
              발송 이력
            </Link>
          </Button>
        </div>
      </header>
      <div className="mx-auto max-w-[1600px] px-5 py-10 lg:px-8">
        <MessageAutomationManager
          key={`${query.templateId ?? ""}:${query.bookId ?? ""}:${query.contactId ?? ""}:${query.selectionKey ?? ""}:${query.courseId ?? ""}`}
          books={booksResult.data ?? []}
          rosters={rostersResult.data ?? []}
          templates={templatesResult.data ?? []}
          courses={coursesResult.data ?? []}
          initialBookId={query.bookId ?? ""}
          initialTemplateId={query.templateId ?? ""}
          initialSelectionKey={query.selectionKey ?? ""}
          initialCourseId={query.courseId ?? ""}
          selectedContact={contactResult.data}
          loadError={
            booksResult.error?.message ||
            templatesResult.error?.message ||
            coursesResult.error?.message ||
            contactResult.error?.message ||
            (query.contactId && !contactResult.data ? "선택한 수신자를 찾을 수 없습니다. 명단에서 다시 선택해 주세요." : undefined) ||
            rostersResult.error?.message
          }
        />
      </div>
    </main>
  );
}
