import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, History } from "lucide-react";

import { MessageAutomationManager } from "@/components/address-books/message-automation-manager";
import { Button } from "@/components/ui/button";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

type Props = {
  searchParams: Promise<{ bookId?: string; contactId?: string }>;
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
  const [booksResult, templatesResult, coursesResult, contactResult] =
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
          "id,name,instructor_name,free_kakao_room_1_link,free_kakao_room_2_link,communication_room_link,payment_link,inquiry_link,curriculum_link,free_gift_link,course_viewing_link",
        )
        .order("updated_at", { ascending: false }),
      contactPromise,
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
          books={booksResult.data ?? []}
          templates={templatesResult.data ?? []}
          courses={coursesResult.data ?? []}
          initialBookId={query.bookId ?? ""}
          selectedContact={contactResult.data}
          loadError={
            booksResult.error?.message ||
            templatesResult.error?.message ||
            coursesResult.error?.message ||
            contactResult.error?.message
          }
        />
      </div>
    </main>
  );
}
