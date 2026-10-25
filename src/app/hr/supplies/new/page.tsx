import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { SupplyRequestForm } from "@/components/hr/supply-request-form";
import { Button } from "@/components/ui/button";
import { requireSupplyRequestContext } from "@/lib/supply-requests/server";

export default async function NewSupplyRequestPage() {
  await requireSupplyRequestContext().catch((error: unknown) => {
    if (error instanceof Error && error.message === "UNAUTHORIZED") redirect("/login");
    if (error instanceof Error && error.message === "PERSONNEL_INACTIVE") notFound();
    throw error;
  });

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-5 sm:p-7 lg:p-9">
      <div className="flex items-center gap-3">
        <Button asChild size="icon-sm" variant="outline">
          <Link href="/hr/supplies" aria-label="비품 신청 목록으로 돌아가기">
            <ArrowLeft aria-hidden="true" />
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">새 비품 신청</h1>
      </div>
      <SupplyRequestForm />
    </div>
  );
}
