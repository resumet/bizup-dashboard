"use client";
import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type Item = { id: string; title: string; description: string; dueDate: string; completedAt: string };
export function DashboardAlertCompletions({ initialItems }: { initialItems: Item[] }) {
  const [items, setItems] = useState(initialItems); const [busy, setBusy] = useState(""); const [error, setError] = useState("");
  async function remove(item: Item) { if (!window.confirm("이 완료 기록을 삭제할까요?")) return; setBusy(item.id); setError(""); try { const response = await fetch(`/api/dashboard/preparation-alerts?id=${item.id}`, { method: "DELETE" }); if (!response.ok) throw new Error(); setItems((current) => current.filter((value) => value.id !== item.id)); } catch { setError("완료 기록을 삭제하지 못했습니다."); } finally { setBusy(""); } }
  return <>{error ? <p className="mb-3 text-sm text-destructive">{error}</p> : null}{items.length ? <div className="space-y-3">{items.map((item) => <article key={item.id} className="flex gap-3 rounded-lg border p-3"><div className="min-w-0 flex-1"><p className="font-medium">{item.title}</p><p className="mt-1 text-sm text-muted-foreground">{item.description}</p><p className="mt-1 text-xs text-muted-foreground">기준일 {item.dueDate} · 완료 {new Date(item.completedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</p></div><Button type="button" variant="ghost" size="icon-sm" className="text-destructive" aria-label={`${item.title} 완료 기록 삭제`} disabled={Boolean(busy)} onClick={() => void remove(item)}>{busy === item.id ? <Loader2 className="animate-spin" /> : <Trash2 />}</Button></article>)}</div> : <p className="text-sm text-muted-foreground">완료된 알림이 없습니다.</p>}</>;
}
