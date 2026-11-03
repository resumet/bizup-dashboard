"use client";

import { useState } from "react";
import { ExternalLink, Loader2, PackageOpen } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { SupplyApprovalStatus, SupplyRequest, SupplyRequestCommand } from "@/lib/supply-requests/types";

type SupplyRequestCommandWithoutVersion =
  | Omit<Extract<SupplyRequestCommand, { action: "approval" }>, "version">
  | Omit<Extract<SupplyRequestCommand, { action: "purchase" }>, "version">
  | Omit<Extract<SupplyRequestCommand, { action: "assignee" }>, "version">;

type SupplyAssignee = { id: string; name: string };

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const priceFormatter = new Intl.NumberFormat("ko-KR");

const approvalLabel: Record<SupplyApprovalStatus, string> = {
  pending: "승인 대기",
  approved: "승인",
  rejected: "거부",
};

function ApprovalBadge({ status }: { status: SupplyApprovalStatus }) {
  const className = status === "approved"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : status === "rejected"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : "border-amber-200 bg-amber-50 text-amber-700";
  return <Badge variant="outline" className={className}>{approvalLabel[status]}</Badge>;
}

function PurchaseBadge({ purchased }: { purchased: boolean }) {
  return purchased
    ? <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">구매 완료</Badge>
    : <Badge variant="secondary">미구매</Badge>;
}

async function readJson(response: Response) {
  const body = await response.json().catch(() => ({})) as SupplyRequest & { message?: string };
  if (!response.ok) throw new Error(body.message ?? "상태를 변경하지 못했습니다.");
  return body;
}

export function SupplyRequestList({
  initialRequests,
  canManage,
  assignees = [],
}: {
  initialRequests: SupplyRequest[];
  canManage: boolean;
  assignees?: SupplyAssignee[];
}) {
  const [requests, setRequests] = useState(initialRequests);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function updateRequest(item: SupplyRequest, command: SupplyRequestCommandWithoutVersion, field: string) {
    if (busy) return;
    setBusy(`${item.id}:${field}`);
    setError("");
    try {
      const updated = await readJson(await fetch(`/api/hr/supplies/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...command, version: item.version }),
      }));
      setRequests((current) => current.map((request) => request.id === updated.id ? updated : request));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "상태를 변경하지 못했습니다.");
    } finally {
      setBusy("");
    }
  }

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>신청 내역</CardTitle>
      </CardHeader>
      <CardContent className="px-0">
        {error ? (
          <p className="mx-4 mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert" aria-live="polite">
            {error}
          </p>
        ) : null}
        {requests.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center gap-3 px-6 py-12 text-center text-muted-foreground">
            <PackageOpen className="size-9" aria-hidden="true" />
            <p>신청한 비품이 없습니다.</p>
          </div>
        ) : (
          <div className="[&>[data-slot=table-container]]:overflow-x-hidden">
            <Table className="w-full table-fixed">
              <colgroup>
                <col className="w-[9%]" />
                <col className="w-[6%]" />
                <col className="w-[9%]" />
                <col className="w-[10%]" />
                <col className="w-[18%]" />
                <col className="w-[7%]" />
                <col className="w-[10%]" />
                <col className="w-[13%]" />
                <col className="w-[9%]" />
                <col className="w-[9%]" />
              </colgroup>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">신청 날짜</TableHead>
                  <TableHead>신청자</TableHead>
                  <TableHead>담당자</TableHead>
                  <TableHead>비품 이름</TableHead>
                  <TableHead>구매링크</TableHead>
                  <TableHead className="text-right">가격</TableHead>
                  <TableHead>신청 목적</TableHead>
                  <TableHead>비고</TableHead>
                  <TableHead>승인 여부</TableHead>
                  <TableHead className="pr-4">구매 여부</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((item) => {
                  const approvalBusy = busy === `${item.id}:approval`;
                  const purchaseBusy = busy === `${item.id}:purchase`;
                  const assigneeBusy = busy === `${item.id}:assignee`;
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="pl-4 whitespace-nowrap">{dateFormatter.format(new Date(item.requestedAt))}</TableCell>
                      <TableCell className="truncate font-medium" title={item.requesterName}>{item.requesterName}</TableCell>
                      <TableCell>
                        {canManage ? (
                          <div className="flex min-w-0 items-center gap-1">
                            <Select
                              value={item.assigneeId ?? undefined}
                              onValueChange={(assigneeId) => updateRequest(item, { action: "assignee", assigneeId }, "assignee")}
                              disabled={Boolean(busy)}
                            >
                              <SelectTrigger size="sm" className="min-w-0 flex-1 px-2" aria-label={`${item.itemName} 담당자`}>
                                <SelectValue placeholder="미지정" />
                              </SelectTrigger>
                              <SelectContent>
                                {assignees.map((person) => <SelectItem key={person.id} value={person.id}>{person.name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            {assigneeBusy ? <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden="true" /> : null}
                          </div>
                        ) : <span className="block truncate font-medium" title={item.assigneeName}>{item.assigneeName}</span>}
                      </TableCell>
                      <TableCell className="truncate font-medium" title={item.itemName}>{item.itemName}</TableCell>
                      <TableCell>
                        {item.purchaseUrl ? (
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="min-w-0 flex-1 truncate text-muted-foreground" title={item.purchaseUrl}>
                              {item.purchaseUrl}
                            </span>
                            <Button asChild size="sm" variant="outline" className="shrink-0">
                              <a href={item.purchaseUrl} target="_blank" rel="noopener noreferrer">
                                바로가기
                                <ExternalLink aria-hidden="true" />
                              </a>
                            </Button>
                          </div>
                        ) : "-"}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">{priceFormatter.format(item.priceKrw)}원</TableCell>
                      <TableCell className="break-words whitespace-pre-wrap">{item.purpose}</TableCell>
                      <TableCell className="break-words whitespace-pre-wrap text-muted-foreground">{item.note || "-"}</TableCell>
                      <TableCell>
                        {canManage ? (
                          <div className="flex min-w-0 items-center gap-1">
                            <Select
                              value={item.approvalStatus}
                              onValueChange={(value) => updateRequest(item, {
                                action: "approval",
                                status: value as SupplyApprovalStatus,
                              }, "approval")}
                              disabled={Boolean(busy) || item.purchased}
                            >
                              <SelectTrigger size="sm" className="min-w-0 flex-1 px-2" aria-label={`${item.itemName} 승인 여부`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="pending">승인 대기</SelectItem>
                                <SelectItem value="approved">승인</SelectItem>
                                <SelectItem value="rejected">거부</SelectItem>
                              </SelectContent>
                            </Select>
                            {approvalBusy ? <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden="true" /> : null}
                          </div>
                        ) : <ApprovalBadge status={item.approvalStatus} />}
                      </TableCell>
                      <TableCell className="pr-4">
                        {canManage ? (
                          <div className="flex min-w-0 items-center gap-1">
                            <Select
                              value={item.purchased ? "purchased" : "pending"}
                              onValueChange={(value) => updateRequest(item, {
                                action: "purchase",
                                purchased: value === "purchased",
                              }, "purchase")}
                              disabled={Boolean(busy) || item.approvalStatus !== "approved"}
                            >
                              <SelectTrigger size="sm" className="min-w-0 flex-1 px-2" aria-label={`${item.itemName} 구매 여부`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="pending">미구매</SelectItem>
                                <SelectItem value="purchased">구매 완료</SelectItem>
                              </SelectContent>
                            </Select>
                            {purchaseBusy ? <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden="true" /> : null}
                          </div>
                        ) : <PurchaseBadge purchased={item.purchased} />}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
