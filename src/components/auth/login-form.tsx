"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setMessage("");
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    const supabase = createClient();
    const result = mode === "login"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (result.error) { setMessage(result.error.message); return; }
    if (mode === "signup" && !result.data.session) { setMessage("확인 이메일을 보냈습니다. 이메일 인증 후 로그인해 주세요."); return; }
    router.push("/services/course-roster/new"); router.refresh();
  }

  return <Card className="w-full max-w-md"><CardHeader className="text-center"><span className="mx-auto mb-2 grid size-11 place-items-center rounded-xl bg-primary text-primary-foreground"><Sparkles className="size-5" /></span><CardTitle className="text-2xl">BIZUP {mode === "login" ? "로그인" : "계정 만들기"}</CardTitle><CardDescription>명단을 안전하게 저장하려면 계정 인증이 필요합니다.</CardDescription></CardHeader><CardContent><form onSubmit={submit} className="space-y-5"><div className="space-y-2"><Label htmlFor="email">이메일</Label><Input id="email" name="email" type="email" autoComplete="email" required /></div><div className="space-y-2"><Label htmlFor="password">비밀번호</Label><Input id="password" name="password" type="password" minLength={6} autoComplete={mode === "login" ? "current-password" : "new-password"} required /></div>{message && <Alert><AlertDescription>{message}</AlertDescription></Alert>}<Button className="w-full" disabled={loading}>{loading && <Loader2 className="animate-spin" />}{mode === "login" ? "로그인" : "계정 만들기"}</Button><Button type="button" variant="ghost" className="w-full" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setMessage(""); }}>{mode === "login" ? "처음이신가요? 계정 만들기" : "이미 계정이 있나요? 로그인"}</Button></form></CardContent></Card>;
}
