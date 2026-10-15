"use client";

import { Label } from "@/components/ui/label";

const methods = ["신용카드", "현금결제", "가상계좌", "간편결제", "계좌이체", "기타"];
const colors: Record<string, string> = {
  신용카드: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300",
  카드: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300",
  현금결제: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  가상계좌: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-300",
  간편결제: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300",
  계좌이체: "border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-800 dark:bg-cyan-950 dark:text-cyan-300",
};

export function PaymentMethodField({ id, value, onChange }: {
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return <div className="space-y-2">
    <Label htmlFor={id}>결제방법</Label>
    <select id={id} value={value} onChange={(event) => onChange(event.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <option value="">선택해 주세요</option>
      {value && !methods.includes(value) ? <option value={value}>{value}</option> : null}
      {methods.map((method) => <option key={method} value={method}>{method}</option>)}
    </select>
  </div>;
}

export function PaymentMethodBadge({ value }: { value?: string }) {
  const values = [...new Set((value ?? "").split("/").map((method) => method.trim()).filter(Boolean))];
  if (!values.length) return <span className="text-muted-foreground">—</span>;
  return <div className="flex flex-wrap gap-1.5">{values.map((method) => <span key={method} className={`inline-flex whitespace-nowrap rounded-md border px-2.5 py-1 text-xs font-medium ${colors[method] ?? "border-border bg-muted text-muted-foreground"}`}>{method}</span>)}</div>;
}
