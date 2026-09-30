"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LockKeyhole } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LeadGateForm({ slug }: { slug: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const query = new URLSearchParams(window.location.search);
      const response = await fetch(`/api/article/${encodeURIComponent(slug)}/lead`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          phone,
          utmSource: query.get("utm_source") ?? "",
          utmMedium: query.get("utm_medium") ?? "",
          utmCampaign: query.get("utm_campaign") ?? "",
          utmContent: query.get("utm_content") ?? "",
          referrer: document.referrer,
        }),
      });
      const body = await response.json() as { message?: string };
      if (!response.ok) throw new Error(body.message ?? "정보를 등록하지 못했습니다.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "정보를 등록하지 못했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="my-10 rounded-2xl border bg-card p-6 shadow-sm sm:p-8" aria-labelledby="lead-gate-title">
      <div className="mb-6 flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><LockKeyhole className="size-5" /></span>
        <h2 id="lead-gate-title" className="text-xl font-semibold">나머지 내용 확인</h2>
      </div>
      {error ? <Alert variant="destructive" className="mb-5"><AlertDescription>{error}</AlertDescription></Alert> : null}
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
        <div className="space-y-2"><Label htmlFor="lead-name">이름</Label><Input id="lead-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} autoComplete="name" required /></div>
        <div className="space-y-2"><Label htmlFor="lead-phone">전화번호</Label><Input id="lead-phone" value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" autoComplete="tel" placeholder="010-0000-0000" required /></div>
        <Button className="mt-2 sm:col-span-2" size="lg" disabled={submitting}>{submitting ? <Loader2 className="animate-spin" /> : null}{submitting ? "확인 중" : "계속 읽기"}</Button>
      </form>
    </section>
  );
}
