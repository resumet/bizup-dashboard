"use client";

import { useState, type FormEvent } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DASHBOARD_MENU_SEARCH_ITEMS } from "@/lib/dashboard/menu-search";
import {
  createDashboardMenuSearchKeywordSettings,
  type DashboardMenuSearchKeywordSettings,
} from "@/lib/dashboard/menu-search-keywords";

function toDrafts(settings: DashboardMenuSearchKeywordSettings) {
  return Object.fromEntries(
    DASHBOARD_MENU_SEARCH_ITEMS.map((item) => [item.href, (settings.keywords[item.href] ?? []).join(", ")]),
  );
}

export function MenuSearchKeywordsManager({
  initialSettings,
  loadError,
}: {
  initialSettings: DashboardMenuSearchKeywordSettings;
  loadError?: string;
}) {
  const [drafts, setDrafts] = useState(() => toDrafts(initialSettings));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(loadError ?? "");
  const [notice, setNotice] = useState("");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");

    try {
      const settings = createDashboardMenuSearchKeywordSettings(drafts);
      const response = await fetch("/api/admin/menu-search-keywords", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const body = await response.json() as { message?: string; keywords?: DashboardMenuSearchKeywordSettings["keywords"] };
      if (!response.ok || !body.keywords) throw new Error(body.message || "메뉴 검색어를 저장하지 못했습니다.");
      const saved = createDashboardMenuSearchKeywordSettings(
        Object.fromEntries(Object.entries(body.keywords).map(([route, keywords]) => [route, keywords.join(", ")])),
      );
      setDrafts(toDrafts(saved));
      setNotice("메뉴 검색어를 저장했습니다. 대시보드 검색에 바로 반영됩니다.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "메뉴 검색어를 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>메뉴 검색어 설정</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="space-y-5">
          <p className="text-sm text-muted-foreground">각 메뉴에 추가할 검색어를 쉼표로 구분해 입력하세요.</p>
          <div className="grid gap-3 lg:grid-cols-2">
            {DASHBOARD_MENU_SEARCH_ITEMS.map((item) => (
              <label key={item.href} className="grid gap-2 rounded-xl border border-slate-200 p-3.5">
                <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {item.label}
                  <Badge variant="outline" className="font-normal">{item.group}</Badge>
                </span>
                <Input
                  value={drafts[item.href] ?? ""}
                  onChange={(event) => setDrafts((current) => ({ ...current, [item.href]: event.target.value }))}
                  placeholder="추가 검색어를 쉼표로 구분"
                  maxLength={520}
                  disabled={saving}
                  aria-label={`${item.label} 추가 검색어`}
                />
                {item.keywords?.length ? (
                  <span className="text-xs text-muted-foreground">기본 검색어: {item.keywords.join(", ")}</span>
                ) : null}
              </label>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={saving}>{saving ? "저장 중…" : "메뉴 검색어 저장"}</Button>
            {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
            {notice ? <p role="status" className="text-sm text-emerald-700">{notice}</p> : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
