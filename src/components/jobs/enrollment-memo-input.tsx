"use client";

import { useId, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

import { Input } from "@/components/ui/input";
import { ENROLLMENT_MEMO_MAX_LENGTH } from "@/lib/jobs/enrollment-memo";

export function EnrollmentMemoInput({
  jobId,
  enrollmentId,
  initialValue,
  studentName,
  onSaved,
}: {
  jobId: string;
  enrollmentId: string;
  initialValue: string;
  studentName: string;
  onSaved?: (memo: string) => void;
}) {
  const errorId = useId();
  const persistedValue = useRef(initialValue);
  const [memo, setMemo] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function saveMemo() {
    if (saving) return;
    const normalizedMemo = memo.trim();
    if (normalizedMemo === persistedValue.current) {
      if (memo !== persistedValue.current) setMemo(persistedValue.current);
      return;
    }

    setSaving(true);
    setError("");
    try {
      const response = await fetch(
        `/api/jobs/${jobId}/enrollments/${enrollmentId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ memo: normalizedMemo }),
        },
      );
      const body = (await response.json()) as {
        memo?: string;
        message?: string;
      };
      if (!response.ok || typeof body.memo !== "string") {
        throw new Error(body.message ?? "비고를 저장하지 못했습니다.");
      }

      persistedValue.current = body.memo;
      setMemo(body.memo);
      onSaved?.(body.memo);
    } catch (caught) {
      setMemo(persistedValue.current);
      setError(
        caught instanceof Error ? caught.message : "비고를 저장하지 못했습니다.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-w-44">
      <div className="relative">
        <Input
          className="h-9 pr-8"
          aria-label={`${studentName || "수강생"} 비고`}
          aria-describedby={error ? errorId : undefined}
          aria-invalid={Boolean(error)}
          placeholder="최대 20자"
          maxLength={ENROLLMENT_MEMO_MAX_LENGTH}
          value={memo}
          onChange={(event) => {
            setMemo(event.target.value);
            setError("");
          }}
          onBlur={saveMemo}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
        />
        {saving ? (
          <Loader2 className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        ) : null}
      </div>
      {error ? (
        <p id={errorId} className="mt-1 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
