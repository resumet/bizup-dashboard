"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, Plus, RotateCcw, Save, Trash2 } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  defaultInstagramChecklistTemplateItems,
  type InstagramChecklistTemplateItem,
} from "@/lib/course-documents/instagram-checklist";

type TemplateResponse = { items?: InstagramChecklistTemplateItem[]; message?: string };

function newItem(): InstagramChecklistTemplateItem {
  return { id: crypto.randomUUID(), title: "" };
}

export function InstagramChecklistTemplateManager() {
  const [items, setItems] = useState<InstagramChecklistTemplateItem[]>([]);
  const [savedItems, setSavedItems] = useState<InstagramChecklistTemplateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const dirty = JSON.stringify(items) !== JSON.stringify(savedItems);

  useEffect(() => {
    let active = true;
    fetch("/api/instagram-management/checklist", { cache: "no-store" })
      .then(async (response) => ({ response, body: await response.json() as TemplateResponse }))
      .then(({ response, body }) => {
        if (!active) return;
        if (!response.ok || !body.items) throw new Error(body.message ?? "템플릿을 불러오지 못했습니다.");
        setItems(body.items);
        setSavedItems(body.items);
      })
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof Error ? caught.message : "템플릿을 불러오지 못했습니다.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  async function save(nextItems = items, reset = false) {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/instagram-management/checklist", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: nextItems.map((item) => ({ ...item, title: item.title.trim() })) }),
      });
      const body = await response.json() as TemplateResponse;
      if (!response.ok || !body.items) throw new Error(body.message ?? "템플릿을 저장하지 못했습니다.");
      setItems(body.items);
      setSavedItems(body.items);
      setNotice(reset ? "기본 체크리스트로 초기화했습니다." : "체크리스트 템플릿을 저장했습니다.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "템플릿을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  function resetTemplate() {
    if (!window.confirm("공용 체크리스트를 기본 7개 항목으로 초기화할까요?")) return;
    void save(defaultInstagramChecklistTemplateItems(), true);
  }

  return <div className="space-y-5">
    {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
    {notice ? <Alert><Check className="text-emerald-600" /><AlertDescription>{notice}</AlertDescription></Alert> : null}
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle>공용 체크리스트 항목</CardTitle>
        <Button type="button" variant="outline" disabled={loading || saving} onClick={resetTemplate}>
          <RotateCcw />기본값으로 초기화
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">저장한 항목은 모든 강의의 인스타그램 상세 화면에 적용되며, 강의별 완료 체크는 각각 유지됩니다.</p>
        {loading ? <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />불러오는 중</div> : <div className="space-y-3">
          {items.map((item, index) => <div key={item.id} className="flex items-center gap-2">
            <span className="w-7 shrink-0 text-right text-sm tabular-nums text-muted-foreground">{index + 1}</span>
            <Input
              value={item.title}
              maxLength={200}
              disabled={saving}
              aria-label={`${index + 1}번째 할 일`}
              onChange={(event) => setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, title: event.target.value } : entry))}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-destructive"
              disabled={saving}
              aria-label={`${item.title || `${index + 1}번째 할 일`} 삭제`}
              onClick={() => setItems((current) => current.filter((entry) => entry.id !== item.id))}
            ><Trash2 /></Button>
          </div>)}
          {!items.length ? <p className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">등록된 항목이 없습니다. 할 일을 추가해 주세요.</p> : null}
        </div>}
        <div className="flex flex-wrap justify-between gap-3 border-t pt-4">
          <Button type="button" variant="outline" disabled={loading || saving || items.length >= 30} onClick={() => setItems((current) => [...current, newItem()])}>
            <Plus />할 일 추가
          </Button>
          <Button type="button" disabled={loading || saving || !dirty || items.some((item) => !item.title.trim())} onClick={() => void save()}>
            {saving ? <Loader2 className="animate-spin" /> : <Save />}{saving ? "저장 중" : "템플릿 저장"}
          </Button>
        </div>
      </CardContent>
    </Card>
  </div>;
}
