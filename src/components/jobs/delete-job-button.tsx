"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export function DeleteJobButton({ jobId, jobName, canDelete }: { jobId: string; jobName: string; canDelete: boolean }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  async function deleteJob() {
    if (!canDelete) return;
    setDeleting(true); setError("");
    try {
      const response = await fetch(`/api/jobs/${jobId}`, { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message ?? "작업 삭제에 실패했습니다.");
      router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "작업 삭제에 실패했습니다."); setDeleting(false); }
  }

  return <AlertDialog><AlertDialogTrigger asChild><Button variant="ghost" size="icon" aria-label={`${jobName} 삭제`} disabled={!canDelete}><Trash2 /></Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>작업을 삭제할까요?</AlertDialogTitle><AlertDialogDescription><strong>{jobName}</strong>의 명단, 파일 버전과 발송 작업이 삭제됩니다. 이 작업은 되돌릴 수 없습니다.</AlertDialogDescription></AlertDialogHeader>{error && <p className="text-sm text-destructive">{error}</p>}<AlertDialogFooter><AlertDialogCancel disabled={deleting}>취소</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={(event) => { event.preventDefault(); void deleteJob(); }} disabled={deleting || !canDelete}>{deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}삭제</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>;
}

