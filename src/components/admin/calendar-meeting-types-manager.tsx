"use client";

import { useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { calendarChipStyle, meetingTypeColor, suggestedMeetingColor } from "@/lib/shared-calendar/colors";
import type { MeetingType } from "@/lib/shared-calendar/types";

export function CalendarMeetingTypesManager({ initialTypes, loadError }: { initialTypes: MeetingType[]; loadError?: string }) {
  const [types, setTypes] = useState(initialTypes);
  const [name, setName] = useState("");
  const [newColor, setNewColor] = useState(() => suggestedMeetingColor(initialTypes));
  const [edit, setEdit] = useState<{ type: MeetingType; color: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const color = edit?.color ?? newColor;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      const response = await fetch("/api/admin/calendar-meeting-types", {
        method: edit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(edit ? { id: edit.type.id, color } : { name, color }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "회의 항목을 저장하지 못했습니다.");
      const saved: MeetingType = body.meetingType;
      if (edit) {
        setTypes(types.map((type) => type.id === saved.id ? saved : type));
        toast("회의 항목 색상을 변경했습니다.");
        setEdit(null);
      } else {
        const updated = [...types, saved];
        setTypes(updated);
        setName("");
        setNewColor(suggestedMeetingColor(updated));
        toast("회의 항목을 추가했습니다.");
      }
    } catch (failure) {
      toast(failure instanceof Error ? failure.message : "회의 항목을 저장하지 못했습니다.", { tone: "error" });
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return <Card>
    <CardHeader><CardTitle><h2>회의 항목 추가</h2></CardTitle></CardHeader>
    <CardContent className="space-y-4">
      {loadError ? <p role="alert" className="text-sm text-destructive">{loadError}</p> : null}
      <ul className="flex flex-wrap gap-2" aria-label="등록된 회의 항목">
        {types.map((type) => <li key={type.id}>
          <button type="button" disabled={busy} aria-pressed={edit?.type.id === type.id}
            aria-label={`${type.name} 색상 변경`} title={`${type.name} 색상 변경`}
            className="rounded-md border px-3 py-1.5 text-sm font-medium aria-pressed:ring-2 aria-pressed:ring-ring aria-pressed:ring-offset-2"
            style={calendarChipStyle(edit?.type.id === type.id ? edit.color : meetingTypeColor(type))}
            onClick={() => setEdit({ type, color: meetingTypeColor(type) })}>{type.name}</button>
        </li>)}
      </ul>
      <form onSubmit={submit} className="flex max-w-xl flex-wrap items-end gap-2">
        <label className="grid min-w-32 flex-1 gap-2 text-sm">회의 항목 이름
          <Input required maxLength={40} value={edit?.type.name ?? name} disabled={busy} readOnly={Boolean(edit)} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="grid gap-2 text-sm">칩 배경색
          <input type="color" value={color} disabled={busy} className="h-9 w-16 cursor-pointer rounded-md border p-1"
            onChange={(event) => edit ? setEdit({ ...edit, color: event.target.value }) : setNewColor(event.target.value)} />
        </label>
        <Button type="submit" disabled={busy || (edit ? color === meetingTypeColor(edit.type) : !name.trim())}>
          {busy ? "저장 중…" : edit ? "색상 저장" : "항목 추가"}
        </Button>
        {edit ? <Button type="button" variant="outline" disabled={busy} onClick={() => setEdit(null)}>취소</Button> : null}
      </form>
    </CardContent>
  </Card>;
}
