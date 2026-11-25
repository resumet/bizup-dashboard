"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";

export function ShortUrlKeyManager() {
  const [apiKey, setApiKey] = useState("");
  const [status, setStatus] = useState<{ configured: boolean; updatedAt: string | null } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin/short-url-key", { cache: "no-store", signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error(); setStatus(await response.json()); setError(""); })
      .catch(() => { if (!controller.signal.aborted) setError("설정을 불러오지 못했습니다."); });
    return () => controller.abort();
  }, [retry]);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !apiKey.trim()) return;
    setBusy(true);
    try {
      const response = await fetch("/api/admin/short-url-key", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ apiKey }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "API 키를 저장하지 못했습니다.");
      setStatus(result); setApiKey(""); setError("");
      toast("API 키를 저장했습니다.");
    } catch (cause) { toast(cause instanceof Error ? cause.message : "API 키를 저장하지 못했습니다.", { tone: "error" }); }
    finally { setBusy(false); }
  }
  return <Card>
    <CardHeader><CardTitle>짧은 주소 발급 API 키</CardTitle></CardHeader>
    <CardContent>
      <form onSubmit={save} className="space-y-4">
        {error ? <div role="alert" className="flex items-center gap-3 text-sm text-destructive">{error}<Button type="button" variant="outline" onClick={() => setRetry(value => value + 1)}>다시 시도</Button></div>
          : <p className="text-sm text-muted-foreground">{status ? status.configured ? "API 키가 등록되어 있습니다." : "등록된 API 키가 없습니다." : "설정을 불러오는 중입니다."}</p>}
        <div className="space-y-2">
          <Label htmlFor="short-url-api-key">API 키</Label>
          <Input id="short-url-api-key" type="password" autoComplete="new-password" spellCheck={false} maxLength={4096} value={apiKey} onChange={event => setApiKey(event.target.value)} disabled={busy || !status || Boolean(error)} placeholder={status?.configured ? "변경할 API 키를 입력하세요" : "API 키를 입력하세요"} aria-describedby="short-url-key-help" />
          <p id="short-url-key-help" className="text-xs text-muted-foreground">저장된 키는 다시 표시하지 않습니다. 새 키를 저장하면 기존 키가 교체됩니다.</p>
        </div>
        <Button type="submit" disabled={busy || !status || Boolean(error) || !apiKey.trim()}>{busy ? "저장 중…" : "저장하기"}</Button>
      </form>
    </CardContent>
  </Card>;
}
