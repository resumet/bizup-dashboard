import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { AddressBookManager } from "@/components/address-books/address-book-manager";
import { Button } from "@/components/ui/button";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export default async function AddressBooksPage() {
  const supabase = await createClient();
  const [user, booksResult] = await Promise.all([
    getAuthenticatedUser(supabase),
    supabase
      .from("address_books")
      .select("id,name,contact_count,updated_at")
      .order("updated_at", { ascending: false }),
  ]);
  if (!user) redirect("/login");

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
          <span className="font-semibold">주소록 매니저</span>
        </div>
      </header>
      <div className="mx-auto max-w-[1600px] px-5 py-10 lg:px-8">
        <AddressBookManager
          initialBooks={booksResult.data ?? []}
          loadError={booksResult.error?.message}
        />
      </div>
    </main>
  );
}
