import { notFound, redirect } from "next/navigation";

import { SupplyRequestList } from "@/components/hr/supply-request-list";
import { loadSupplyRequests, requireSupplyRequestContext } from "@/lib/supply-requests/server";

export default async function AdminSupplyRequestsPage() {
  const context = await requireSupplyRequestContext().catch((error: unknown) => {
    if (error instanceof Error && error.message === "UNAUTHORIZED") redirect("/login");
    if (error instanceof Error && error.message === "PERSONNEL_INACTIVE") notFound();
    throw error;
  });
  if (!context.isAdmin) notFound();

  const requests = await loadSupplyRequests(context);

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6 p-5 sm:p-7 lg:p-9">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">비품 관리</h1>
      <SupplyRequestList initialRequests={requests} canManage />
    </div>
  );
}
