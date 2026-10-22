"use client";

import { useState, type FormEvent } from "react";
import { CheckCircle2, Loader2, Save } from "lucide-react";

import { ExternalMarketingProjectFields } from "./project-fields";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ExternalMarketingInfo } from "@/lib/external-marketing/model";

export function ExternalMarketingIntakeForm({ token, initialValue }: { token: string; initialValue: ExternalMarketingInfo }) {
  const [value, setValue] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const response = await fetch(`/api/public/external-marketing/intake/${token}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(value),
      });
      const result = await response.json() as { message?: string };
      if (!response.ok) throw new Error(result.message || "정보를 저장하지 못했습니다.");
      setSaved(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "정보를 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return <main className="min-h-screen bg-muted/25 px-4 py-10 sm:py-16"><Card className="mx-auto max-w-3xl"><CardHeader><CardTitle className="text-2xl">외부마케팅대행 정보 입력</CardTitle></CardHeader><CardContent>
    <form className="grid gap-6" onSubmit={submit}>
      <ExternalMarketingProjectFields value={value} onChange={setValue} disabled={saving} />
      {error ? <Alert variant="destructive"><AlertTitle>저장할 수 없습니다</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
      {saved ? <Alert><CheckCircle2 /><AlertTitle>저장 완료</AlertTitle><AlertDescription>입력한 정보가 담당자 대시보드에 반영되었습니다.</AlertDescription></Alert> : null}
      <div className="flex justify-end"><Button type="submit" disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <Save />}저장</Button></div>
    </form>
  </CardContent></Card></main>;
}
