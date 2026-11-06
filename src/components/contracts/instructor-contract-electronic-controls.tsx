"use client";

import { CheckCircle2, Copy, Download, Link2, Loader2 } from "lucide-react";
import { useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { InstructorContractSigningStatus } from "@/lib/contracts/instructor-contract";

export function InstructorContractElectronicControls({ contractId, signingStatus, signedAt }: { contractId: string; signingStatus: InstructorContractSigningStatus; signedAt: string | null }) {
  const [creating, setCreating] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [message, setMessage] = useState("");

  async function createLink() {
    setCreating(true);
    setMessage("");
    try {
      const response = await fetch(`/api/contracts/${contractId}/public-link`, { method: "POST" });
      const result = await response.json() as { url?: string; message?: string };
      if (!response.ok || !result.url) throw new Error(result.message || "공개 링크를 만들지 못했습니다.");
      setShareUrl(result.url);
      setMessage("공개 링크를 만들었습니다. 강사에게 전달해 주세요.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "공개 링크를 만들지 못했습니다.");
    } finally {
      setCreating(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setMessage("공개 링크를 복사했습니다.");
    } catch {
      setMessage("복사하지 못했습니다. 링크를 직접 선택해 복사해 주세요.");
    }
  }

  return (
    <section className="space-y-3 rounded-xl border bg-card p-4" aria-label="전자계약 관리">
      <div className="flex items-center justify-between gap-3"><h2 className="font-semibold">전자계약</h2>{signingStatus === "completed" ? <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700"><CheckCircle2 className="size-4" aria-hidden="true" />계약 완료</span> : <span className="text-sm text-muted-foreground">서명 대기</span>}</div>
      {signingStatus === "completed" ? <><p className="text-sm text-muted-foreground">{signedAt ? new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" }).format(new Date(signedAt)) : ""} 전자서명 완료</p><Button variant="outline" asChild><a href={`/api/contracts/${contractId}/signed-pdf`}><Download aria-hidden="true" />서명 완료 PDF 다운로드</a></Button></> : <><p className="text-sm text-muted-foreground">공개 링크를 만든 뒤 강사에게 전달하면, 강사가 계약서를 읽고 직접 서명하거나 도장을 찍을 수 있습니다.</p><Button type="button" disabled={creating} onClick={() => void createLink()}>{creating ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Link2 aria-hidden="true" />}{creating ? "링크 만드는 중" : shareUrl ? "새 공개 링크 만들기" : "공개 링크 만들기"}</Button></>}
      {shareUrl ? <div className="flex gap-2"><input className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-sm" readOnly value={shareUrl} aria-label="전자계약 공개 링크" /><Button type="button" size="icon" variant="outline" onClick={() => void copy()} aria-label="공개 링크 복사"><Copy aria-hidden="true" /></Button></div> : null}
      {message ? <Alert variant={message.includes("못") ? "destructive" : "default"}><AlertDescription>{message}</AlertDescription></Alert> : null}
    </section>
  );
}
