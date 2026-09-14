"use client";
import { cloneElement, createContext, isValidElement, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { HrAction } from "@/lib/hr/validation";
import { STATUS_LABELS, type HrContext, type TaskStatus, type Employee } from "@/lib/hr/types";

const Context = createContext<(HrContext & { directory: Employee[] }) | null>(null);
export function HrProvider({ value, children }: { value: HrContext & { directory: Employee[] }; children: ReactNode }) { return <Context.Provider value={value}>{children}</Context.Provider>; }
export function useHr() { const context = useContext(Context); if (!context) throw new Error("HR context missing"); return context; }
export class ClientHrError extends Error { constructor(message: string, public status: number) { super(message); } }
async function responseData<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const fields = body.fields ? Object.entries(body.fields).map(([field, errors]) => `${field}: ${(errors as string[]).join(", ")}`).join(" / ") : "";
    throw new ClientHrError(`${body.error ?? "요청을 처리하지 못했습니다."}${fields ? ` ${fields}` : ""}`, response.status);
  }
  return body as T;
}
export async function fetchHr<T>(resource: string, filter: Record<string, string | number | undefined> = {}, signal?: AbortSignal): Promise<T> {
  const params = new URLSearchParams({ resource }); for (const [key, value] of Object.entries(filter)) if (value !== undefined && value !== "") params.set(key, String(value));
  return responseData<T>(await fetch(`/api/hr?${params}`, { cache: "no-store", signal }));
}
export function useHrList<T>(resource: string, filter: Record<string, string | number | undefined> = {}) {
  const serialized = JSON.stringify(filter); const [items, setItems] = useState<T[]>(); const [dataKey, setDataKey] = useState(""); const [error, setError] = useState(""); const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      const collected: T[] = [];
      for (let page = 0; ; page++) {
        const result = await fetchHr<{ items?: T[]; tasks?: T[]; total: number }>(resource, { ...JSON.parse(serialized), page, limit: 100 }, controller.signal);
        const batch = result.items ?? result.tasks ?? []; collected.push(...batch);
        if (!batch.length || collected.length >= result.total) break;
      }
      if (!controller.signal.aborted) { setItems(collected); setDataKey(`${resource}:${serialized}`); setError(""); }
    })().catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "목록을 불러오지 못했습니다."); });
    return () => controller.abort();
  }, [resource, serialized, revision]);
  return { items: dataKey === `${resource}:${serialized}` ? items : undefined, error, reload };
}
export function useHrQuery<T>(resource: string, filter: Record<string, string | number | undefined> = {}, autoRefresh = false) {
  const serialized = JSON.stringify(filter); const [data, setData] = useState<T>(); const [dataKey, setDataKey] = useState(""); const [error, setError] = useState(""); const [loading, setLoading] = useState(true); const [refreshed, setRefreshed] = useState<string>(); const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    void fetchHr<T>(resource, JSON.parse(serialized), controller.signal).then(result => { if (!controller.signal.aborted) { setData(result); setDataKey(`${resource}:${serialized}`); setError(""); setRefreshed(new Date().toISOString()); } })
      .catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "불러오지 못했습니다."); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [resource, serialized, revision]);
  useEffect(() => { if (!autoRefresh) return; const timer = setInterval(() => { if (document.visibilityState === "visible") reload(); }, 30_000); return () => clearInterval(timer); }, [autoRefresh, reload]);
  return { data: dataKey === `${resource}:${serialized}` ? data : undefined, error, loading: loading || dataKey !== `${resource}:${serialized}`, reload, refreshed };
}
export function useHrMutation() {
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const pending = useRef<{ fingerprint: string; key: string } | null>(null); const inFlight = useRef(false);
  async function mutate<T = unknown>(action: HrAction, body: Record<string, unknown>): Promise<T> {
    if (inFlight.current) throw new ClientHrError("저장 중입니다. 잠시 기다려 주세요.", 409);
    const fingerprint = JSON.stringify({ action, body });
    if (pending.current?.fingerprint !== fingerprint) pending.current = { fingerprint, key: crypto.randomUUID() };
    inFlight.current = true; setBusy(true); setError("");
    try {
      const result = await responseData<T>(await fetch("/api/hr", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": pending.current.key }, body: fingerprint }));
      pending.current = null; return result;
    } catch (error) { const message = error instanceof Error ? error.message : "저장하지 못했습니다. 입력은 유지됩니다. 다시 시도해 주세요."; setError(message); throw error; }
    finally { inFlight.current = false; setBusy(false); }
  }
  return { mutate, busy, error, clearError: () => setError("") };
}
export function ErrorNotice({ error, retry }: { error?: string; retry?: () => void }) { return error ? <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}{retry && <Button variant="outline" size="sm" onClick={retry} className="ml-3">다시 불러오기</Button>}</div> : null; }
export function StatusBadge({ status }: { status: TaskStatus }) { return <Badge variant="outline" className={{ ready: "bg-slate-50 text-slate-700", doing: "bg-blue-50 text-blue-700", done: "bg-emerald-50 text-emerald-700", cancelled: "bg-red-50 text-red-700" }[status]}>{STATUS_LABELS[status]}</Badge>; }
export function Panel({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) { return <section className="min-w-0 rounded-xl border bg-white p-4 sm:p-6"><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">{title}</h2>{actions}</div>{children}</section>; }
export function Field({ label, children }: { label: string; children: ReactNode }) { const id = useId(); return <div className="grid gap-2 text-sm font-medium"><label htmlFor={id}>{label}</label>{isValidElement<{ id?: string }>(children) ? cloneElement(children, { id }) : children}</div>; }
export const selectClass = "h-11 w-full min-w-0 rounded-md border bg-white px-3 text-sm";
export function PersonSelect({ value, onChange, allowAll = false, exclude, id, options }: { value: string; onChange: (id: string) => void; allowAll?: boolean; exclude?: string; id?: string; options?: Employee[] }) { const { directory } = useHr(); return <select id={id} className={selectClass} value={value} onChange={event => onChange(event.target.value)}>{allowAll && <option value="">전체 직원</option>}{(options ?? directory).filter(p => p.id !== exclude).map(person => <option key={person.id} value={person.id}>{person.name}{person.department ? ` · ${person.department}` : ""}{person.active === false ? " (비활성)" : ""}</option>)}</select>; }
export function Pager({ page, total, onPage, limit = 50 }: { page: number; total: number; onPage: (page: number) => void; limit?: number }) { return <div className="mt-5 flex items-center justify-end gap-3 text-sm"><span>총 {total}건 · {page + 1}페이지</span><Button variant="outline" disabled={page === 0} onClick={() => onPage(page - 1)}>이전</Button><Button variant="outline" disabled={(page + 1) * limit >= total} onClick={() => onPage(page + 1)}>다음</Button></div>; }
