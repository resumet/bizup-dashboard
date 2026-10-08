"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { saveAccountPassword } from "@/lib/supabase/password-setup";

export function SetPasswordForm({
  userId, email, minimumLength,
}: { userId: string; email?: string; minimumLength: number }) {
  const router = useRouter();
  const submitting = useRef(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [saved, setSaved] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setLoading(true);
    setMessage("");

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    let completed = false;
    try {
      const error = await saveAccountPassword(
        createClient(), userId, String(form.get("password") ?? ""),
        String(form.get("confirmation") ?? ""), minimumLength,
      );
      if (error) {
        setMessage(error);
        return;
      }
      formElement.reset();
      completed = true;
      setSaved(true);
      router.replace("/");
      router.refresh();
    } catch {
      setMessage("비밀번호를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      // Stay locked after success while navigation completes.
      if (!completed) {
        setLoading(false);
        submitting.current = false;
      }
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <h1 className="text-xl font-semibold">비밀번호 설정</h1>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-5" aria-busy={loading}>
          {email ? <div className="space-y-2"><Label htmlFor="account-email">계정 이메일</Label><Input id="account-email" type="email" autoComplete="username" value={email} readOnly /></div> : null}
          <div className="space-y-2">
            <Label htmlFor="new-password">새 비밀번호</Label>
            <Input id="new-password" name="password" type="password" minLength={minimumLength} autoComplete="new-password" aria-describedby="password-help" required autoFocus disabled={loading || saved} />
            <p id="password-help" className="text-sm text-muted-foreground">{minimumLength}자 이상 입력해 주세요. 계정의 보안 정책에 따라 영문 대·소문자, 숫자, 특수문자가 필요할 수 있습니다.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">비밀번호 확인</Label>
            <Input id="confirm-password" name="confirmation" type="password" autoComplete="new-password" required disabled={loading || saved} />
          </div>
          {message ? <Alert variant="destructive" role="alert"><AlertDescription>{message}</AlertDescription></Alert> : null}
          {saved ? <p role="status" className="text-sm">비밀번호가 저장되었습니다. 서비스로 이동합니다.</p> : null}
          <Button type="submit" className="w-full" disabled={loading || saved}>
            {loading ? <Loader2 className="animate-spin" /> : null}
            {saved ? "저장 완료" : loading ? "저장 중..." : "비밀번호 저장"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
