"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, MoreHorizontal, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  intakeProgress,
  type Answers,
} from "@/lib/instructor-intake/model";
import { IntakeProgress } from "./progress";

type IntakeCardProps = {
  id: string;
  title: string;
  answers: Answers;
  photoCount: number;
  shareEnabled: boolean;
  submittedAt: string | null;
};

export function IntakeCard({
  id,
  title,
  answers,
  photoCount,
  shareEnabled,
  submittedAt,
}: IntakeCardProps) {
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const status = !shareEnabled
    ? "수집 마감"
    : submittedAt
      ? "제출 완료"
      : intakeProgress(answers, photoCount).received > 0
        ? "작성 중"
        : "입력 대기";

  async function deleteCard() {
    setDeleting(true);
    setDeleteError("");
    try {
      const response = await fetch(`/api/instructor-intakes/${id}`, {
        method: "DELETE",
      });
      const result = (await response.json()) as { message?: string };
      if (!response.ok)
        throw new Error(result.message ?? "카드를 삭제하지 못했습니다.");
      setDeleteOpen(false);
      router.refresh();
    } catch (error) {
      setDeleteError(
        error instanceof Error
          ? error.message
          : "카드를 삭제하지 못했습니다.",
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <article className="relative rounded-xl border bg-card transition-colors hover:border-primary">
        <Link
          href={`/services/instructor-intakes/${id}`}
          className="block space-y-5 rounded-xl p-5 pr-14 focus-visible:outline-2 focus-visible:outline-primary"
        >
          <h2 className="truncate text-lg font-semibold">{title}</h2>
          <IntakeProgress answers={answers} photoCount={photoCount} />
          <div className="flex justify-between gap-3 text-sm text-muted-foreground">
            <span>{status}</span>
            <span>사진 {photoCount}장</span>
          </div>
          {answers.nickname || answers.realName ? (
            <p className="truncate text-sm">
              {[answers.realName, answers.nickname].filter(Boolean).join(" · ")}
            </p>
          ) : null}
        </Link>
        <div className="absolute right-3 top-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`${title} 카드 메뉴`}
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => {
                  setDeleteError("");
                  setDeleteOpen(true);
                }}
              >
                <Trash2 />
                삭제
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </article>

      <AlertDialog
        open={deleteOpen}
        onOpenChange={(open) => {
          if (deleting) return;
          setDeleteOpen(open);
          if (!open) setDeleteError("");
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>강사 카드를 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              &apos;{title}&apos; 카드와 강사가 입력한 정보 및 업로드한 사진이
              모두 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError ? (
            <p role="alert" className="text-sm text-destructive">
              {deleteError}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>취소</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleting}
              onClick={(event) => {
                event.preventDefault();
                void deleteCard();
              }}
            >
              {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
              {deleting ? "삭제 중..." : "삭제"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
