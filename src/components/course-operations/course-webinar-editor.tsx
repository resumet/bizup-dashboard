"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { emptyWebinarMetrics, formatMetric, parseWebinarMetrics, ratio, ratioDefinitions, webinarFields, type WebinarField, type WebinarRecord } from "@/lib/course-webinars/metrics";

type Draft = Record<WebinarField, string>;
const toDraft = (record: ReturnType<typeof emptyWebinarMetrics>): Draft => Object.fromEntries(webinarFields.map(({ key }) => [key, record[key]?.toString() ?? ""])) as Draft;

export function CourseWebinarEditor({ courseId }: { courseId: string }) {
  const [draft, setDraft] = useState(() => toDraft(emptyWebinarMetrics()));
  const [saved, setSaved] = useState(() => toDraft(emptyWebinarMetrics()));
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/course-operations/${courseId}/webinar`, { cache: "no-store", signal: controller.signal })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "웨비나 정보를 불러오지 못했습니다.");
        const record = body.metrics as WebinarRecord | null;
        const next = toDraft(record ?? emptyWebinarMetrics());
        setDraft(next); setSaved(next); setVersion(record?.version ?? 0); setLoaded(true); setError("");
      }).catch(error => { if (!controller.signal.aborted) setError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [courseId, reload]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  let preview = emptyWebinarMetrics();
  let validation = "";
  try { preview = parseWebinarMetrics(draft); } catch (error) { validation = (error as Error).message; }
  async function save(event: React.FormEvent) {
    event.preventDefault(); setNotice(""); setError("");
    if (validation) { setError(validation); return; }
    setSaving(true);
    try {
      const response = await fetch(`/api/course-operations/${courseId}/webinar`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ metrics: preview, version }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "웨비나 정보를 저장하지 못했습니다.");
      const record = body.metrics as WebinarRecord;
      const next = toDraft(record);
      setDraft(next); setSaved(next); setVersion(record.version);
      setNotice("라이브 웨비나 정보를 저장했습니다. WORK 대시보드에 반영됩니다.");
    } catch (error) { setError(error instanceof Error ? error.message : "저장하지 못했습니다."); }
    finally { setSaving(false); }
  }
  return <div className="space-y-6">
    <Card>
      <CardHeader><CardTitle>라이브 웨비나 실적</CardTitle><CardDescription>강의별 최종 실적을 직접 입력합니다. 빈칸은 미입력, 0은 실제 실적 없음으로 저장합니다. 주문·비용 내역과 별도로 관리합니다.</CardDescription></CardHeader>
      <CardContent>
        {error && <p role="alert" className="mb-4 text-sm text-destructive">{error}</p>}
        {notice && <p role="status" className="mb-4 text-sm text-emerald-700">{notice}</p>}
        {loading && <p role="status" className="mb-4 text-sm text-muted-foreground">웨비나 정보를 불러오는 중입니다.</p>}
        <form onSubmit={save}>
          <fieldset disabled={!loaded || loading || saving} className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {webinarFields.map(field => <div key={field.key} className="space-y-2">
              <Label htmlFor={`webinar-${field.key}`}>{field.label} ({field.unit})</Label>
              <Input id={`webinar-${field.key}`} type="number" min={0} max={field.max} step={field.key === "hours_to_peak" ? "0.01" : "1"} inputMode={field.key === "hours_to_peak" ? "decimal" : "numeric"} value={draft[field.key]} placeholder="미입력" onChange={event => { setDraft(current => ({ ...current, [field.key]: event.target.value })); setNotice(""); }} />
              {field.key === "hours_to_peak" && <p className="text-xs text-muted-foreground">라이브 시작부터 경과 시간 · 예: 1시간 30분 = 1.5</p>}
              {field.key === "group_chat_count" && <p className="text-xs text-muted-foreground">무료 단톡방이 여러 개라면 합산 인원을 입력합니다.</p>}
            </div>)}
          </fieldset>
          {validation && <p className="mt-4 text-sm text-destructive">{validation}</p>}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={!loaded || loading || saving || Boolean(validation)}>{saving ? "저장 중…" : "웨비나 정보 저장"}</Button>
            <Button type="button" variant="outline" disabled={loading || saving} onClick={() => { if (dirty && !window.confirm("저장하지 않은 입력을 버리고 다시 불러올까요?")) return; setLoading(true); setNotice(""); setReload(value => value + 1); }}>새로 불러오기</Button>
            {dirty && <span className="text-xs text-muted-foreground">저장하지 않은 변경사항</span>}
          </div>
        </form>
      </CardContent>
    </Card>
    <Card>
      <CardHeader><CardTitle>전환율과 광고 효율</CardTitle><CardDescription>현재 입력값 기준입니다. 모든 라이브 전환율은 최대 인원을 기준으로 계산합니다. 구매 전환율은 결제 건수 기준이며 고유 구매자 비율과 다를 수 있습니다.</CardDescription></CardHeader>
      <CardContent>
        <div className="mb-6 grid gap-3 sm:grid-cols-3" aria-label="웨비나 전환 단계">
          {([['group_chat_count', '최종 단톡방', '명'], ['live_peak_count', '라이브 최대', '명'], ['payment_count', '결제', '건']] as const).map(([key, label, unit], index) => <div className="rounded-xl border bg-muted/30 p-4" key={key}><p className="text-sm text-muted-foreground">{index + 1}. {label}</p><p className="mt-2 text-2xl font-semibold">{formatMetric(preview[key], unit)}</p></div>)}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {ratioDefinitions.map(definition => <div key={definition.key} className="rounded-xl border p-4"><p className="text-sm font-medium">{definition.label}</p><p className="my-2 text-2xl font-semibold text-primary">{formatMetric(ratio(preview[definition.numerator], preview[definition.denominator]), "%")}</p><p className="text-xs leading-5 text-muted-foreground">{definition.formula}</p></div>)}
        </div>
        <p className="mt-4 text-xs text-muted-foreground">분모가 0이거나 필요한 값이 없으면 —로 표시합니다. 소통방 인원은 단톡방 인원에 더하지 않습니다. ROAS는 수익률이 아니라 광고비 대비 매출 비율입니다.</p>
      </CardContent>
    </Card>
  </div>;
}
