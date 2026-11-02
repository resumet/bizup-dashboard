"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  YOUTUBE_FILMING_ALERT_WEEK_OPTIONS,
  type YoutubeFilmingAlertSettings,
  type YoutubeFilmingAlertWeeks,
} from "@/lib/youtube-management/settings";

export function YoutubeFilmingAlertSettingsManager({
  initialSettings,
  loadError,
}: {
  initialSettings: YoutubeFilmingAlertSettings;
  loadError?: string;
}) {
  const [filmingAlertWeeks, setFilmingAlertWeeks] = useState(initialSettings.filmingAlertWeeks);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(loadError ?? "");
  const [notice, setNotice] = useState("");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch("/api/admin/youtube-filming-alert-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filmingAlertWeeks }),
      });
      const body = await response.json() as { filmingAlertWeeks?: YoutubeFilmingAlertWeeks; message?: string };
      if (!response.ok || !body.filmingAlertWeeks) {
        throw new Error(body.message || "알림 기준을 저장하지 못했습니다.");
      }
      setFilmingAlertWeeks(body.filmingAlertWeeks);
      setNotice(`유튜브 촬영 일정 알림 기준을 무료강의 ${body.filmingAlertWeeks}주 전으로 저장했습니다.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "알림 기준을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>유튜브 촬영 일정 알림 설정</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="space-y-4">
          <label className="grid max-w-sm gap-2 text-sm font-medium">
            알림 시작 기준
            <Select
              value={String(filmingAlertWeeks)}
              onValueChange={(value) => setFilmingAlertWeeks(Number(value) as YoutubeFilmingAlertWeeks)}
              disabled={saving}
            >
              <SelectTrigger aria-label="유튜브 촬영 일정 알림 시작 기준">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {YOUTUBE_FILMING_ALERT_WEEK_OPTIONS.map((weeks) => (
                  <SelectItem key={weeks} value={String(weeks)}>무료강의 {weeks}주 전</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="font-normal text-muted-foreground">
              선택한 시점에 도달하면 출연 확정 건 중 촬영 일정이 확정되지 않았거나 촬영일이 없는 항목을 표시합니다.
            </span>
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={saving}>{saving ? "저장 중…" : "알림 기준 저장"}</Button>
            {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
            {notice ? <p role="status" className="text-sm text-emerald-700">{notice}</p> : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
