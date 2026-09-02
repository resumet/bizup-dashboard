import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { AddressBookDetail } from "@/components/address-books/address-book-detail";
import { PendingLinkLabel } from "@/components/navigation/pending-link-label";
import { Button } from "@/components/ui/button";
import { loadAddressBookContactsPage } from "@/lib/address-books/load";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

type Props = {
  params: Promise<{ bookId: string }>;
  searchParams: Promise<{ page?: string; q?: string; sort?: string }>;
};

const CONTACTS_PER_PAGE = 100;

export default async function AddressBookDetailPage({
  params,
  searchParams,
}: Props) {
  const { bookId } = await params;
  const queryParams = await searchParams;
  const requestedPage = Number.parseInt(queryParams.page ?? "1", 10);
  const page =
    Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const keyword = (queryParams.q ?? "").trim();
  const sort = queryParams.sort === "nameDesc" ? "nameDesc" : "nameAsc";
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) redirect("/login");

  const { data: book } = await supabase
    .from("address_books")
    .select("id,name,contact_count,updated_at")
    .eq("id", bookId)
    .maybeSingle();
  if (!book) notFound();

  const contactsResult = await loadAddressBookContactsPage(supabase, bookId, {
    page,
    pageSize: CONTACTS_PER_PAGE,
    keyword,
    sort,
  });
  const totalContacts = keyword
    ? contactsResult.totalCount
    : Math.max(book.contact_count, contactsResult.totalCount);

  return (
    <main className="min-h-screen">
      <header className="border-b">
        <div className="mx-auto flex h-18 max-w-[1600px] items-center px-5 lg:px-8">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/services/address-books">
              <PendingLinkLabel
                idle={
                  <>
                    <ArrowLeft />
                    주소록 목록
                  </>
                }
                pending="이동 중"
              />
            </Link>
          </Button>
          <div className="mx-3 h-5 w-px bg-border" />
          <span className="font-semibold">{book.name}</span>
        </div>
      </header>
      <div className="mx-auto max-w-[1600px] px-5 py-8 lg:px-8">
        <AddressBookDetail
          mode="manager"
          book={book}
          contacts={contactsResult.contacts}
          totalContacts={totalContacts}
          currentPage={page}
          contactsPerPage={CONTACTS_PER_PAGE}
          initialKeyword={keyword}
          initialSort={sort}
          templates={[]}
          history={[]}
        />
      </div>
    </main>
  );
}
