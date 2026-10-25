import Link from "next/link";
import { Plus } from "lucide-react";

import { SupplyRequestList } from "@/components/hr/supply-request-list";
import { Button } from "@/components/ui/button";
import { loadSupplyRequests, requireSupplyRequestContext } from "@/lib/supply-requests/server";

export default async function SupplyRequestsPage() {
  const context = await requireSupplyRequestContext();
  const requests = await loadSupplyRequests(context);

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6 p-5 sm:p-7 lg:p-9">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">비품 신청</h1>
        <Button asChild>
          <Link href="/hr/supplies/new">
            <Plus aria-hidden="true" />
            비품 신청
          </Link>
        </Button>
      </div>
      <SupplyRequestList initialRequests={requests} canManage={false} />
    </div>
  );
}
