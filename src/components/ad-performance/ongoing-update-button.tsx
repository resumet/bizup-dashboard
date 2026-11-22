"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";

type Target = { courseId: string; dashboardId: string | null; name: string; kakaoUrl: string };
type Progress = Target & { status: "waiting" | "running" | "updated" | "skipped" | "failed"; message: string };

async function postUpdate<T>(url: string, body?: object): Promise<T> {
  const response = await fetch(url, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result) throw new Error(result?.message || "업데이트 요청을 처리하지 못했습니다.");
  return result;
}

export function OngoingUpdateButton({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  const pending = useRef(false);
  const [running, setRunning] = useState(false);
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState("");
  const [creativeError, setCreativeError] = useState("");
  const [rows, setRows] = useState<Progress[]>([]);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function saveCounts() {
    if (pending.current) return;
    const targets = rows.filter(row => row.status === "updated" && counts[row.courseId]?.trim());
    if (!targets.length) { toast("저장할 누적인원을 입력해 주세요.", { tone: "info" }); return; }
    if (targets.some(row => !/^\d+$/.test(counts[row.courseId].trim()) || !Number.isSafeInteger(Number(counts[row.courseId])))) {
      toast("누적인원은 0 이상의 정수로 입력해 주세요.", { tone: "error" }); return;
    }
    pending.current = true;
    setSaving(true);
    let failed = 0;
    for (const row of targets) {
      try {
        const response = await fetch(`/api/ad-performance/${row.dashboardId}/sheet-manual-inputs/latest`, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chatMembersCumulative: Number(counts[row.courseId]) }),
        });
        const result = await response.json();
        if (!response.ok || !result.saved) throw new Error(result.message || "인원을 저장하지 못했습니다.");
        mark(row.courseId, "updated", `${result.metricDate} · 누적인원 ${counts[row.courseId]}명 저장 완료`);
        setCounts(current => ({ ...current, [row.courseId]: "" }));
      } catch (error) {
        failed++;
        mark(row.courseId, "updated", error instanceof Error ? error.message : "인원을 저장하지 못했습니다.");
      }
    }
    pending.current = false;
    setSaving(false);
    toast(failed ? `저장 완료 ${targets.length - failed}개 · 실패 ${failed}개. 실패한 강의는 다시 저장해 주세요.` : "톡방 누적인원을 저장했습니다.", { tone: failed ? "error" : "success" });
    router.refresh();
    if (!failed) setOpen(false);
  }

  function openKakao(url: string) {
    if (!url) { toast("강의에 무료특강 단톡방 링크를 저장해 주세요.", { tone: "info" }); return; }
    try {
      const parsed = new URL(url);
      if (!["https:", "http:"].includes(parsed.protocol)) throw new Error();
      window.open(parsed.href, "_blank", "noopener,noreferrer");
    } catch { toast("강의의 단톡방 링크를 확인해 주세요.", { tone: "error" }); }
  }

  function mark(courseId: string, status: Progress["status"], message: string) {
    setRows(current => current.map(row => row.courseId === courseId ? { ...row, status, message } : row));
  }

  async function run() {
    if (pending.current) return;
    pending.current = true;
    setRunning(true);
    setOpen(true);
    setRows([]);
    setCounts({});
    setCreativeError("");
    setSummary("진행 중인 강의를 확인하고 공통 소재성과를 갱신하고 있습니다.");
    try {
      const plan = await postUpdate<{ courses: Target[]; creativeError: string }>("/api/ad-performance/bulk-update");
      setCreativeError(plan.creativeError);
      const progress = plan.courses.map<Progress>(course => ({
        ...course, status: course.dashboardId ? "waiting" : "skipped", message: course.dashboardId ? "대기" : "건너뜀 · 내부광고 대시보드 미연결",
      }));
      setRows(progress);
      const targets = progress.filter(row => row.dashboardId);
      let failed = 0;
      for (const [index, row] of targets.entries()) {
        setSummary(`광고성과 업데이트 중 (${index + 1}/${targets.length})`);
        mark(row.courseId, "running", "업데이트 중");
        try {
          const result = await postUpdate<{ saved: boolean; metricCount: number }>(`/api/ad-performance/${row.dashboardId}/update`, {
            action: "update-ongoing", courseId: row.courseId,
          });
          if (!result.saved) throw new Error("광고성과 저장을 확인하지 못했습니다.");
          mark(row.courseId, "updated", `완료 · ${result.metricCount}일 반영`);
        } catch (error) {
          failed++;
          mark(row.courseId, "failed", error instanceof Error ? error.message : "업데이트하지 못했습니다.");
        }
      }
      const skipped = progress.length - targets.length;
      const message = progress.length
        ? `강의 업데이트 결과 · 완료 ${targets.length - failed}개 · 실패 ${failed}개 · 건너뜀 ${skipped}개`
        : "업데이트할 진행 중인 강의가 없습니다.";
      setSummary(message);
      toast(message, { tone: failed || plan.creativeError ? "error" : !targets.length ? "info" : "success" });
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "업데이트를 시작하지 못했습니다.";
      setSummary(message);
      toast(message, { tone: "error" });
    } finally {
      pending.current = false;
      setRunning(false);
    }
  }

  return <>
    <Button variant="outline" disabled={disabled || running || saving} onClick={() => void run()}>
      {running ? <Loader2 className="animate-spin" /> : <RefreshCw />}업데이트
    </Button>
    <Dialog open={open} onOpenChange={next => { if (!pending.current) setOpen(next); }}>
      <DialogContent showCloseButton={!running && !saving} aria-describedby={undefined} className="sm:max-w-3xl">
        <DialogHeader><DialogTitle>진행 중인 강의 업데이트</DialogTitle></DialogHeader>
        <p role="status" className="flex items-center gap-2 text-sm">{running && <Loader2 className="size-4 shrink-0 animate-spin" />}{summary}</p>
        {creativeError && <p className="text-sm text-destructive">공통 소재성과 갱신 실패 · {creativeError}</p>}
        {rows.length > 0 && <ul className="max-h-[55dvh] divide-y overflow-y-auto rounded-lg border">
          {rows.map(row => <li key={row.courseId} className="flex flex-wrap items-center gap-3 px-4 py-2">
            <div className="min-w-0 flex-1 space-y-1">
            <div className="break-words text-sm font-medium">{row.name}</div>
            <div className={row.status === "failed" ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>{row.message}</div>
            </div>
            {!running && <div className="flex shrink-0 items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => openKakao(row.kakaoUrl)}>카톡열기</Button>
              <Input type="number" min="0" step="1" inputMode="numeric" className="w-28" placeholder="누적인원" aria-label={`${row.name} 누적인원`} disabled={saving || row.status !== "updated"} value={counts[row.courseId] ?? ""} onChange={event => setCounts(current => ({ ...current, [row.courseId]: event.target.value }))} />
            </div>}
          </li>)}
        </ul>}
        {!running && rows.some(row => row.status === "updated") && <div className="flex justify-end"><Button disabled={saving} onClick={() => void saveCounts()}>{saving && <Loader2 className="animate-spin" />}저장하기</Button></div>}
      </DialogContent>
    </Dialog>
  </>;
}
