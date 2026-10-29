"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Loader2, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { validateBusinessTripFile } from "@/lib/business-trip-reports/file";
import type { BusinessTripReport } from "@/lib/business-trip-reports/types";

type ApiBody = BusinessTripReport & {
  message?: string;
  path?: string;
  uploadUrl?: string;
};

async function readJson(response: Response) {
  const body = await response.json().catch(() => ({})) as ApiBody;
  if (!response.ok) throw new Error(body.message ?? "출장보고서를 저장하지 못했습니다.");
  return body;
}

export function BusinessTripReportForm({
  initialReport,
  canUpdatePaymentStatus,
}: {
  initialReport?: BusinessTripReport;
  canUpdatePaymentStatus: boolean;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initialReport?.title ?? "");
  const [finalCost, setFinalCost] = useState(String(initialReport?.finalCost ?? 0));
  const [paymentCompleted, setPaymentCompleted] = useState(initialReport?.paymentCompleted ?? false);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setStage("기본 정보 저장");
    try {
      const amount = Number(finalCost);
      if (!Number.isSafeInteger(amount) || amount < 0) throw new Error("최종 비용은 0원 이상의 정수로 입력해 주세요.");
      const endpoint = initialReport
        ? `/api/business-trip-reports/${initialReport.id}`
        : "/api/business-trip-reports";
      let report = await readJson(await fetch(endpoint, {
        method: initialReport ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          finalCost: amount,
          paymentCompleted,
          ...(initialReport ? { version: initialReport.version } : {}),
        }),
      }));

      if (file) {
        const format = validateBusinessTripFile(file);
        setStage("파일 업로드 준비");
        const prepared = await readJson(await fetch(`/api/business-trip-reports/${report.id}/file`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileName: file.name, fileSize: file.size, mimeType: format.mimeType }),
        }));
        if (!prepared.path || !prepared.uploadUrl) throw new Error("파일 업로드 주소를 받지 못했습니다.");

        setStage("파일 업로드");
        const uploaded = await fetch(prepared.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": format.mimeType },
          body: file,
        });
        if (!uploaded.ok) throw new Error("출장보고서 파일 업로드에 실패했습니다.");

        setStage("파일 등록");
        report = await readJson(await fetch(`/api/business-trip-reports/${report.id}/file`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            path: prepared.path,
            fileName: file.name,
            fileSize: file.size,
            mimeType: format.mimeType,
            version: report.version,
          }),
        }));
      }

      router.push(`/services/business-trip-reports/${report.id}`);
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "출장보고서를 저장하지 못했습니다.");
    } finally {
      setBusy(false);
      setStage("");
    }
  }

  return (
    <Card className="w-full">
      <CardHeader className="border-b">
        <CardTitle>{initialReport ? "출장보고서 수정" : "출장보고서 작성"}</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="space-y-6" onSubmit={submit}>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
            <div className="space-y-2">
              <Label htmlFor="trip-report-title">제목</Label>
              <Input
                id="trip-report-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={200}
                required
                placeholder="출장 목적이나 방문지를 입력해 주세요"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="trip-report-cost">최종 비용</Label>
              <div className="relative">
                <Input
                  id="trip-report-cost"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  value={finalCost}
                  onChange={(event) => setFinalCost(event.target.value)}
                  className="pr-12"
                  required
                />
                <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm text-muted-foreground">원</span>
              </div>
            </div>
          </div>

          <div className={canUpdatePaymentStatus
            ? "grid items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]"
            : "grid gap-5"}
          >
            <div className="space-y-2">
              <Label htmlFor="trip-report-file">작성된 출장보고서 파일</Label>
              <Input
                id="trip-report-file"
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
                disabled={busy}
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
              <p className="text-xs text-muted-foreground">
                PDF, Word, Excel, JPG, PNG · 최대 50MB
                {initialReport?.fileName ? ` · 현재 파일: ${initialReport.fileName}` : ""}
              </p>
            </div>

            {canUpdatePaymentStatus ? (
              <div className="space-y-2">
                <Label>비용 지급 상태</Label>
                <label className="flex h-9 w-full cursor-pointer items-center gap-3 rounded-md border bg-muted/20 px-3">
                  <input
                    type="checkbox"
                    checked={paymentCompleted}
                    onChange={(event) => setPaymentCompleted(event.target.checked)}
                    className="size-4 accent-emerald-600"
                  />
                  <span className="text-sm font-medium">비용 지급 완료</span>
                </label>
              </div>
            ) : null}
          </div>

          {error ? <p role="alert" className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p> : null}

          <div className="grid w-full grid-cols-2 gap-3 sm:w-80">
            <Button type="submit" className="w-full" disabled={busy || !title.trim()}>
              {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : file ? <FileUp aria-hidden="true" /> : <Save aria-hidden="true" />}
              {stage || "저장"}
            </Button>
            <Button type="button" variant="outline" className="w-full" disabled={busy} onClick={() => router.back()}>취소</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
