import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { AddressBookManager } from "@/components/address-books/address-book-manager";
import { BackLink } from "@/components/layout/back-link";
import { Button } from "@/components/ui/button";
import { hasAdminAccess } from "@/lib/admin/access";
import { requireCourseOperationsMembership } from "@/lib/course-operations/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { paidExclusionRostersQuery, paidExclusionRosterOption } from "@/lib/address-books/paid-rosters";

export default async function AddressBooksPage() {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) redirect("/login");
  const membership = await requireCourseOperationsMembership(user.id);
  const [booksResult, rostersResult] = await Promise.all([
    supabase
      .from("address_books")
      .select("id,name,contact_count,updated_at")
      .eq("workspace_id", membership.workspace_id)
      .order("updated_at", { ascending: false }),
    paidExclusionRostersQuery(supabase, membership.workspace_id)
      .order("updated_at", { ascending: false }),
  ]);

  return (
    <main className="min-h-screen">
      <header className="border-b">
        <div className="mx-auto flex h-18 max-w-[1900px] items-center px-5 lg:px-8">
          <Button variant="ghost" size="sm" asChild>
            <BackLink href="/">
              <ArrowLeft />
              뒤로가기
            </BackLink>
          </Button>
          <div className="mx-3 h-5 w-px bg-border" />
          <span className="font-semibold">주소록 매니저</span>
        </div>
      </header>
      <div className="mx-auto max-w-[1900px] px-5 py-10 lg:px-8">
        <AddressBookManager
          initialBooks={booksResult.data ?? []}
          exclusionRosters={(rostersResult.data ?? []).map(paidExclusionRosterOption)}
          exclusionLoadError={rostersResult.error ? "저장된 유료수강생 명단을 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요." : undefined}
          loadError={booksResult.error?.message}
          canDelete={hasAdminAccess(user.email, membership.role)}
        />
      </div>
    </main>
  );
}
