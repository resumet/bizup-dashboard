"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { Columns3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const COLUMNS = [
  ["customerName", "결제자"], ["groupChat", "단톡방 참여"],
  ["extraParticipant", "별도 추가 인원"], ["phone", "결제자 연락처"],
  ["recipient", "수신 수강생"], ["email", "이메일"], ["optionName", "옵션명"],
  ["paymentMethod", "결제방법"], ["rs", "RS"], ["paymentId", "결제ID"],
  ["paymentAmount", "결제금액"], ["memo", "비고"],
] as const;

export type PaidRosterColumn = (typeof COLUMNS)[number][0];
const CHANGE_EVENT = "paid-roster-columns-change";
// Keep controls usable even when the browser blocks storage or its quota is full.
const memorySettings = new Map<string, string>();
const serverSnapshot = () => null;

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function parseHiddenColumns(value: string | null): PaidRosterColumn[] {
  try {
    const parsed: unknown = JSON.parse(value ?? "[]");
    if (!Array.isArray(parsed)) return [];
    const hidden = COLUMNS.map(([key]) => key).filter((key) => parsed.includes(key));
    return hidden.length < COLUMNS.length ? hidden : [];
  } catch {
    return [];
  }
}

export function usePaidRosterColumns(userId: string) {
  const storageKey = `bizup:paid-roster-columns:v1:${userId}`;
  const getSnapshot = useCallback(() => {
    if (memorySettings.has(storageKey)) return memorySettings.get(storageKey)!;
    try { return window.localStorage.getItem(storageKey); } catch { return null; }
  }, [storageKey]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, serverSnapshot);
  const hiddenColumns = useMemo(() => parseHiddenColumns(snapshot), [snapshot]);
  const setHiddenColumns = useCallback((hidden: PaidRosterColumn[]) => {
    const value = JSON.stringify(hidden);
    try { window.localStorage.setItem(storageKey, value); memorySettings.delete(storageKey); }
    catch { memorySettings.set(storageKey, value); }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, [storageKey]);
  return { hiddenColumns, setHiddenColumns };
}

export function PaidRosterColumnOptions({ hiddenColumns, onChange }: {
  hiddenColumns: PaidRosterColumn[];
  onChange: (hidden: PaidRosterColumn[]) => void;
}) {
  const visibleCount = COLUMNS.length - hiddenColumns.length;
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button type="button" variant="outline"><Columns3 />표시 항목 <span className="text-muted-foreground">{visibleCount}/{COLUMNS.length}</span></Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-56">
      <DropdownMenuLabel>표에 표시할 항목 (최소 1개)</DropdownMenuLabel>
      <DropdownMenuSeparator />
      {COLUMNS.map(([key, label]) => {
        const checked = !hiddenColumns.includes(key);
        return <DropdownMenuCheckboxItem key={key} checked={checked} disabled={checked && visibleCount === 1}
          onSelect={(event) => event.preventDefault()}
          onCheckedChange={(value) => onChange(value === true ? hiddenColumns.filter((column) => column !== key) : [...hiddenColumns, key])}>
          {label}
        </DropdownMenuCheckboxItem>;
      })}
      <DropdownMenuSeparator />
      <DropdownMenuItem disabled={hiddenColumns.length === 0} onSelect={() => onChange([])}>전체 표시</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>;
}
