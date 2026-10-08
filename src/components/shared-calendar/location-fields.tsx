"use client";

import { Input } from "@/components/ui/input";
import type { CalendarLocationKind } from "@/lib/shared-calendar/types";

export function LocationFields({ kind, text, onChange }: {
  kind: CalendarLocationKind; text: string;
  onChange: (kind: CalendarLocationKind, text: string) => void;
}) {
  return <div className="grid gap-3">
    <label className="grid gap-2 text-sm">장소
      <select aria-label="장소" className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={kind} onChange={(e) => onChange(e.target.value as CalendarLocationKind, "")}>
        <option value="online">온라인</option><option value="tbd">장소미정</option><option value="custom">입력</option>
      </select>
    </label>
    {kind === "custom" ? <label className="grid gap-2 text-sm">장소 직접 입력
      <Input aria-label="장소 직접 입력" required maxLength={200} placeholder="주소 또는 장소명" value={text} onChange={(e) => onChange(kind, e.target.value)} />
    </label> : null}
  </div>;
}
