"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function ServicesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Service route rendering failed", error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-[1600px] items-center justify-center px-5 py-12 lg:px-8">
      <div className="w-full max-w-lg rounded-2xl border bg-card p-8 text-center shadow-sm">
        <AlertTriangle className="mx-auto size-10 text-destructive" />
        <h1 className="mt-4 text-xl font-semibold">화면을 불러오지 못했습니다</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          잠시 후 다시 시도해 주세요. 문제가 반복되면 관리자에게 알려주세요.
        </p>
        {error.digest ? (
          <p className="mt-2 text-xs text-muted-foreground">오류 번호: {error.digest}</p>
        ) : null}
        <Button className="mt-6" onClick={reset}>
          <RotateCcw />
          다시 시도
        </Button>
      </div>
    </main>
  );
}
