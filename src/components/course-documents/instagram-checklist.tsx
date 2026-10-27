"use client";

import { useEffect, useState } from "react";
import { CheckSquare2, Loader2 } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import type { InstagramChecklistItem } from "@/lib/course-documents/instagram-checklist";

type ChecklistResponse = { items?: InstagramChecklistItem[]; message?: string };

export function InstagramChecklist({ courseId }: { courseId: string }) {
  const [items, setItems] = useState<InstagramChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch(`/api/instagram-management/checklist/${encodeURIComponent(courseId)}`, { cache: "no-store" })
      .then(async (response) => ({ response, body: await response.json() as ChecklistResponse }))
      .then(({ response, body }) => {
        if (!active) return;
        if (!response.ok || !body.items) throw new Error(body.message ?? "할 일을 불러오지 못했습니다.");
        setItems(body.items);
      })
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof Error ? caught.message : "할 일을 불러오지 못했습니다.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [courseId]);

  async function save(nextItems: InstagramChecklistItem[]) {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/instagram-management/checklist/${encodeURIComponent(courseId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completedItemIds: nextItems.filter((item) => item.completed).map((item) => item.id) }),
      });
      const body = await response.json() as ChecklistResponse;
      if (!response.ok || !body.items) throw new Error(body.message ?? "할 일을 저장하지 못했습니다.");
      setItems(body.items);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "할 일을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="gap-0 overflow-hidden">
      <CardHeader className="flex-row items-center justify-between gap-3 border-b px-5 py-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <CheckSquare2 className="size-5 text-pink-600" aria-hidden="true" />
          공용 할 일 체크리스트
        </CardTitle>
        {saving ? <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" />저장 중</span> : null}
      </CardHeader>
      <CardContent className="p-5">
        {error ? <Alert variant="destructive" className="mb-4"><AlertDescription>{error}</AlertDescription></Alert> : null}
        {loading ? (
          <div className="flex min-h-24 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />불러오는 중</div>
        ) : items.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {items.map((item) => (
              <label key={item.id} className="flex cursor-pointer items-start gap-3 rounded-xl border bg-background p-3.5 transition-colors hover:bg-muted/40">
                <Checkbox
                  className="mt-0.5"
                  checked={item.completed}
                  disabled={saving}
                  onCheckedChange={(checked) => void save(items.map((current) => current.id === item.id ? { ...current, completed: checked === true } : current))}
                />
                <span className={item.completed ? "text-sm leading-5 text-muted-foreground line-through" : "text-sm leading-5 font-medium"}>{item.title}</span>
              </label>
            ))}
          </div>
        ) : <p className="py-6 text-center text-sm text-muted-foreground">목록 화면의 템플릿 수정에서 할 일을 추가해 주세요.</p>}
      </CardContent>
    </Card>
  );
}
