"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Loader2, Trash2 } from "lucide-react";

import { SupplyRequestForm } from "@/components/hr/supply-request-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { SupplyRequest } from "@/lib/supply-requests/types";

export function SupplyRequestDetail({
  request,
  canEdit,
  canDelete,
}: {
  request: SupplyRequest;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  async function deleteRequest() {
    if (deleting || !window.confirm(`“${request.itemName}” 신청을 삭제할까요?`)) return;
    setDeleting(true);
    setError("");
    try {
      const response = await fetch(`/api/hr/supplies/${request.id}`, { method: "DELETE" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { message?: string };
        throw new Error(body.message ?? "비품 신청을 삭제하지 못했습니다.");
      }
      window.location.assign("/hr/supplies");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "비품 신청을 삭제하지 못했습니다.");
      setDeleting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-5 sm:p-7 lg:p-9">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button asChild size="icon-sm" variant="outline">
            <Link href="/hr/supplies" aria-label="비품 신청 목록으로 돌아가기">
              <ArrowLeft aria-hidden="true" />
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">비품 신청 상세</h1>
        </div>
        {canDelete ? (
          <Button type="button" variant="destructive" onClick={() => void deleteRequest()} disabled={deleting}>
            {deleting ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Trash2 aria-hidden="true" />}
            삭제
          </Button>
        ) : null}
      </div>
      {error ? <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{error}</p> : null}
      {canEdit ? <SupplyRequestForm request={request} /> : (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            승인된 비품 신청은 수정할 수 없습니다.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
