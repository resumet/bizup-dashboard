"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";

export function InitializePaidRoster({ courseId }: { courseId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  function initialize() {
    setError("");
    startTransition(async () => {
      try {
        const response = await fetch(`/api/course-operations/${courseId}/paid-students`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderIds: [] }),
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.message ?? "명단을 만들지 못했습니다.");
        router.refresh();
      } catch (reason) { setError(reason instanceof Error ? reason.message : "명단을 만들지 못했습니다."); }
    });
  }
  return <Card>
    <CardHeader><CardTitle>유료수강생</CardTitle><CardDescription>주문내역에서 수강생 명단을 만든 뒤 ‘유료수강생 명단에 저장하기’를 눌러 주세요.</CardDescription></CardHeader>
    <CardContent className="space-y-4">
      <p className="text-sm text-muted-foreground">주문내역 없이 시작하려면 빈 명단을 만든 뒤 수강생을 수동 또는 엑셀로 추가할 수 있습니다.</p>
      <Button type="button" onClick={initialize} disabled={pending}>{pending ? "명단 만드는 중" : "빈 명단으로 시작하기"}</Button>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </CardContent>
  </Card>;
}
