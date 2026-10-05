"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export function RefreshIntakes() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => startTransition(() => router.refresh())}
    >
      {pending ? "불러오는 중…" : "수집 현황 새로고침"}
    </Button>
  );
}

export function CreateIntake({
  courses,
}: {
  courses: Array<{
    id: string;
    name: string;
    instructor_name: string;
    cohort: string;
  }>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <form
      className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const courseId = new FormData(event.currentTarget).get("courseId");
        setBusy(true);
        setError("");
        try {
          const response = await fetch("/api/instructor-intakes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ courseId }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.message);
          router.push(`/services/instructor-intakes/${result.id}`);
          router.refresh();
        } catch (caught) {
          setError(
            caught instanceof Error
              ? caught.message
              : "강사 카드를 만들지 못했습니다.",
          );
          setBusy(false);
        }
      }}
    >
      <div className="min-w-64 flex-1 space-y-2">
        <Label htmlFor="intake-course">기존 강의 선택</Label>
        <select
          id="intake-course"
          name="courseId"
          required
          disabled={busy}
          className="h-10 w-full rounded-md border bg-background px-3 text-sm"
        >
          <option value="">강의를 선택해 주세요</option>
          {courses.map((course) => (
            <option key={course.id} value={course.id}>
              {course.cohort ? `${course.cohort} · ` : ""}
              {course.name}
              {course.instructor_name ? ` · ${course.instructor_name}` : ""}
            </option>
          ))}
        </select>
      </div>
      <Button disabled={busy || !courses.length}>
        {busy ? "만드는 중…" : "강사 카드 만들기"}
      </Button>
      {error ? (
        <p role="alert" className="w-full text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {!courses.length ? (
        <p className="w-full text-sm text-muted-foreground">
          먼저 강의 운영에서 강의를 만들어 주세요.
        </p>
      ) : null}
    </form>
  );
}

export function ShareIntake({
  id,
  token,
  enabled,
  revision,
}: {
  id: string;
  token: string;
  enabled: boolean;
  revision: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const publicPath = `/public/instructor-intake/${token}`;
  async function change(action: "close" | "open" | "rotate") {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/instructor-intakes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, revision }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      router.refresh();
      setMessage(
        action === "rotate"
          ? "새 링크를 만들었습니다. 이전 링크는 사용할 수 없습니다."
          : action === "close"
            ? "정보 수집을 마감했습니다."
            : "정보 수집을 다시 시작했습니다.",
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "공유 설정을 변경하지 못했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3 rounded-xl border bg-card p-5">
      <h2 className="font-semibold">공개 입력 페이지</h2>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={busy || !enabled}
          onClick={async () => {
            setError("");
            setMessage("");
            try {
              await navigator.clipboard.writeText(
                `${window.location.origin}${publicPath}`,
              );
              setMessage("공유 링크를 복사했습니다.");
            } catch {
              setError(
                "링크를 복사하지 못했습니다. 공개 페이지를 열어 주소를 복사해 주세요.",
              );
            }
          }}
        >
          공유 링크 복사
        </Button>
        {enabled ? (
          <Button variant="outline" asChild>
            <a href={publicPath} target="_blank" rel="noopener noreferrer">
              공개 페이지 확인
            </a>
          </Button>
        ) : null}
        <Button
          disabled={busy}
          variant="outline"
          onClick={() => change(enabled ? "close" : "open")}
        >
          {enabled ? "수집 마감" : "수집 다시 시작"}
        </Button>
        <Button
          disabled={busy}
          variant="outline"
          onClick={() => change("rotate")}
        >
          새 공유 링크 만들기
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        링크를 받은 강사는 로그인 없이 정보를 입력하고 수정할 수 있습니다. 해당
        강사에게만 전달해 주세요.
      </p>
      {message ? (
        <p role="status" className="text-sm">
          {message}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
