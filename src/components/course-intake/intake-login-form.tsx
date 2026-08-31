"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { KeyRound, Loader2, LogIn } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function IntakeLoginForm({ configurationError }: { configurationError: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/course-intake/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const body = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(body.message ?? "로그인하지 못했습니다.");
      setPassword("");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "로그인하지 못했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="w-full max-w-md shadow-lg">
      <CardHeader>
        <span className="mb-2 grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
          <KeyRound className="size-5" />
        </span>
        <CardTitle className="text-2xl">강의 생성 페이지</CardTitle>
        <CardDescription>관리자가 전달한 비밀번호를 입력해 주세요.</CardDescription>
      </CardHeader>
      <CardContent>
        {configurationError ? (
          <Alert variant="destructive" className="mb-5">
            <AlertTitle>환경변수 설정이 필요합니다</AlertTitle>
            <AlertDescription>{configurationError}</AlertDescription>
          </Alert>
        ) : null}
        {error ? (
          <Alert variant="destructive" className="mb-5" aria-live="polite">
            <AlertTitle>로그인할 수 없습니다</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <form className="grid gap-4" onSubmit={submit}>
          <div className="grid gap-2">
            <Label htmlFor="intake-password">비밀번호</Label>
            <Input
              id="intake-password"
              className="h-10"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          <Button className="min-h-11" disabled={submitting || Boolean(configurationError)}>
            {submitting ? <Loader2 className="animate-spin" /> : <LogIn />}
            {submitting ? "확인 중" : "로그인"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
