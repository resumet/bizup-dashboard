"use client";

import { useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { MeetingType } from "@/lib/shared-calendar/types";

export function CalendarMeetingTypesManager({ initialTypes, loadError }: { initialTypes: MeetingType[]; loadError?: string }) {
  const [types, setTypes] = useState(initialTypes);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState(loadError ?? "");
  const [notice, setNotice] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending.current) return;
    pending.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/calendar-meeting-types", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "회의 항목을 추가하지 못했습니다.");
      setTypes((current) => [...current, body.meetingType]); setName(""); setNotice("회의 항목을 추가했습니다.");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "회의 항목을 추가하지 못했습니다."); }
    finally { pending.current = false; setBusy(false); }
  }
  return <Card>
    <CardHeader><CardTitle><h2>회의 항목 추가</h2></CardTitle></CardHeader>
    <CardContent className="space-y-4">
      <ul className="flex flex-wrap gap-2" aria-label="등록된 회의 항목">{types.map((type) => <li key={type.id} className="rounded-md border px-3 py-1.5 text-sm">{type.name}</li>)}</ul>
      <form onSubmit={submit} className="flex max-w-xl items-end gap-2">
        <label className="grid min-w-0 flex-1 gap-2 text-sm">회의 항목 이름<Input required maxLength={40} value={name} disabled={busy} onChange={(event) => setName(event.target.value)} /></label>
        <Button type="submit" disabled={busy || !name.trim()}>{busy ? "추가 중…" : "항목 추가"}</Button>
      </form>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {notice ? <p role="status" className="text-sm text-emerald-700">{notice}</p> : null}
    </CardContent>
  </Card>;
}
