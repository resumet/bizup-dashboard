"use client";

import { useState, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export function DeleteSelectedEnrollmentsButton({
  jobId,
  selectedIds,
}: {
  jobId: string;
  selectedIds: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  async function deleteSelected(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    setDeleting(true);
    setError("");
    try {
      const response = await fetch(`/api/jobs/${jobId}/enrollments`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedIds }),
      });
      const body = await response.json();
      if (response.status === 401) {
        router.push("/login");
        return;
      }
      if (!response.ok)
        throw new Error(body.message ?? "선택 항목을 삭제하지 못했습니다.");
      setOpen(false);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "선택 항목을 삭제하지 못했습니다.",
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" disabled={selectedIds.length === 0}>
          <Trash2 />
          선택된 항목 삭제
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            선택한 {selectedIds.length.toLocaleString("ko-KR")}명을 삭제할까요?
          </AlertDialogTitle>
          <AlertDialogDescription>
            최신 명단에서는 제외되지만 이전 명단 버전과 기존 메시지 발송 이력은
            보존됩니다.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>취소</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={deleting}
            onClick={deleteSelected}
          >
            {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
            {deleting ? "삭제 중" : "삭제 승인"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
