"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function HrInviteForm() {
  const router = useRouter(); const [ready, setReady] = useState(false); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    void (async () => {
      const client = createClient(); const params = new URLSearchParams(location.hash.slice(1));
      const access = params.get("access_token"); const refresh = params.get("refresh_token");
      if (access && refresh) {
        const result = await client.auth.setSession({ access_token: access, refresh_token: refresh });
        history.replaceState(null, "", "/hr-invite");
        if (result.error) { if (active) setError("초대 링크가 만료되었습니다. 관리자에게 문의해 주세요."); return; }
      }
      const session = await client.auth.getUser();
      if (active) { setReady(Boolean(session.data.user)); if (!session.data.user) setError("유효한 초대 링크로 접속해 주세요."); }
    })().catch(() => { if (active) setError("초대 인증을 확인하지 못했습니다. 다시 접속해 주세요."); });
    return () => { active = false; };
  }, []);
  return <form className="space-y-5 rounded-2xl border bg-white p-6" onSubmit={async (event) => {
    event.preventDefault(); const data = new FormData(event.currentTarget); const password = String(data.get("password"));
    if (password !== data.get("confirm")) { setError("비밀번호가 일치하지 않습니다."); return; }
    setBusy(true); setError("");
    try { const result = await createClient().auth.updateUser({ password }); if (result.error) throw new Error("비밀번호를 설정하지 못했습니다. 다시 시도해 주세요."); router.replace("/"); router.refresh(); }
    catch (error) { setError(error instanceof Error ? error.message : "설정에 실패했습니다."); } finally { setBusy(false); }
  }}><h1 className="text-2xl font-semibold">비즈업에 오신 것을 환영합니다</h1><p className="text-sm text-muted-foreground">로그인에 사용할 비밀번호를 설정해 주세요.</p>
    <label className="block space-y-2">새 비밀번호<Input name="password" type="password" autoComplete="new-password" required minLength={10} disabled={!ready} /></label>
    <label className="block space-y-2">비밀번호 확인<Input name="confirm" type="password" autoComplete="new-password" required minLength={10} disabled={!ready} /></label>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}<Button className="w-full" disabled={!ready || busy}>{busy ? "저장 중…" : "비밀번호 설정하고 시작"}</Button>
  </form>;
}
