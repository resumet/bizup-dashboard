"use client";

import { useEffect, useState } from "react";
import { CheckSquare2, Loader2, Plus, RotateCcw, Settings2, Trash2 } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { defaultInstagramChecklistItems, type InstagramChecklistItem } from "@/lib/course-documents/instagram-checklist";

type ChecklistResponse = { items?: InstagramChecklistItem[]; message?: string };

function newItemId() {
  return `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function InstagramChecklist() {
  const [items, setItems] = useState<InstagramChecklistItem[]>([]);
  const [draft, setDraft] = useState<InstagramChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/instagram-management/checklist", { cache: "no-store" })
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
  }, []);

  async function save(nextItems: InstagramChecklistItem[], closeSettings = false) {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/instagram-management/checklist", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: nextItems }),
      });
      const body = await response.json() as ChecklistResponse;
      if (!response.ok || !body.items) throw new Error(body.message ?? "할 일을 저장하지 못했습니다.");
      setItems(body.items);
      setDraft(body.items.map((item) => ({ ...item })));
      if (closeSettings) setSettingsOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "할 일을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  function openSettings() {
    setDraft(items.map((item) => ({ ...item })));
    setSettingsOpen(true);
  }

  return (
    <Card className="gap-0 overflow-hidden">
      <CardHeader className="flex-row items-center justify-between gap-3 border-b px-5 py-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <CheckSquare2 className="size-5 text-pink-600" aria-hidden="true" />
          할일 체크하기
        </CardTitle>
        <Button type="button" variant="outline" size="sm" disabled={loading || saving} onClick={openSettings}>
          <Settings2 />템플릿 설정
        </Button>
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
        ) : <p className="py-6 text-center text-sm text-muted-foreground">템플릿 설정에서 할 일을 추가해 주세요.</p>}
      </CardContent>

      <Dialog open={settingsOpen} onOpenChange={(open) => { if (!saving) setSettingsOpen(open); }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>할 일 템플릿 설정</DialogTitle>
            <DialogDescription className="sr-only">인스타그램 관리에 표시할 공용 할 일을 추가, 수정, 삭제합니다.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
            {draft.map((item, index) => (
              <div key={item.id} className="flex items-center gap-2">
                <Input
                  aria-label={`${index + 1}번째 할 일`}
                  maxLength={200}
                  value={item.title}
                  disabled={saving}
                  onChange={(event) => setDraft((current) => current.map((draftItem) => draftItem.id === item.id ? { ...draftItem, title: event.target.value } : draftItem))}
                />
                <Button type="button" variant="ghost" size="icon" aria-label={`${item.title || index + 1} 삭제`} disabled={saving} onClick={() => setDraft((current) => current.filter((draftItem) => draftItem.id !== item.id))}>
                  <Trash2 />
                </Button>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" disabled={saving || draft.length >= 30} onClick={() => setDraft((current) => [...current, { id: newItemId(), title: "", completed: false }])}><Plus />할 일 추가</Button>
            <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={() => setDraft(defaultInstagramChecklistItems())}><RotateCcw />기본 템플릿</Button>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={saving} onClick={() => setSettingsOpen(false)}>취소</Button>
            <Button type="button" disabled={saving || draft.some((item) => !item.title.trim())} onClick={() => void save(draft.map((item) => ({ ...item, title: item.title.trim() })), true)}>
              {saving ? <Loader2 className="animate-spin" /> : null}저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
