"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { acceptInviteSession, readInviteTokens } from "@/lib/supabase/invite-session";

export function InviteCallback() {
  const started = useRef(false);
  const pending = useRef(false);
  const tokens = useRef<ReturnType<typeof readInviteTokens>>(null);
  const [retryable, setRetryable] = useState(false);

  async function finish() {
    if (pending.current || !tokens.current) return;
    pending.current = true;
    setRetryable(false);
    try {
      const result = await acceptInviteSession(createClient(), tokens.current);
      if (result.ok) {
        tokens.current = null;
        // A full navigation waits for cookie persistence and avoids stale RSC
        // prefetches from the account that was previously signed in.
        window.location.replace("/set-password");
      } else if (result.reason === "unavailable") {
        setRetryable(true);
      } else {
        tokens.current = null;
        window.location.replace(`/auth/invite-error?reason=${result.reason}`);
      }
    } catch {
      setRetryable(true);
    } finally {
      pending.current = false;
    }
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    tokens.current = readInviteTokens(window.location.hash);
    // Remove credentials before creating the SDK client (which otherwise tries
    // to interpret an implicit invite as PKCE), and before any network request.
    window.history.replaceState(window.history.state, "", "/auth/callback");
    if (!tokens.current) {
      window.location.replace("/auth/invite-error?reason=invalid");
      return;
    }
    void finish();
  }, []);

  return (
    <Card className="w-full max-w-md">
      <CardHeader><h1 className="text-xl font-semibold">초대 확인</h1></CardHeader>
      <CardContent className="space-y-5">
        {retryable ? <>
          <Alert variant="destructive"><AlertDescription>인증 서버에 연결하지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.</AlertDescription></Alert>
          <Button type="button" className="w-full" onClick={() => void finish()}>다시 시도</Button>
        </> : <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />초대를 확인하고 있습니다.
        </div>}
        <noscript>초대를 확인하려면 브라우저에서 JavaScript를 허용한 뒤 메일의 링크를 다시 열어 주세요.</noscript>
      </CardContent>
    </Card>
  );
}
