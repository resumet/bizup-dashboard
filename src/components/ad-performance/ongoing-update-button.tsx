"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";

type Target = { courseId: string; dashboardId: string | null; name: string };
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

  function mark(courseId: string, status: Progress["status"], message: string) {
    setRows(current => current.map(row => row.courseId === courseId ? { ...row, status, message } : row));
  }

  async function run() {
    if (pending.current) return;
    pending.current = true;
    setRunning(true);
    setOpen(true);
    setRows([]);
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
    <Button variant="outline" disabled={disabled || running} onClick={() => void run()}>
      {running ? <Loader2 className="animate-spin" /> : <RefreshCw />}업데이트
    </Button>
    <Dialog open={open} onOpenChange={next => { if (!pending.current) setOpen(next); }}>
      <DialogContent showCloseButton={!running} aria-describedby={undefined} className="sm:max-w-lg">
        <DialogHeader><DialogTitle>진행 중인 강의 업데이트</DialogTitle></DialogHeader>
        <p role="status" className="flex items-center gap-2 text-sm">{running && <Loader2 className="size-4 shrink-0 animate-spin" />}{summary}</p>
        {creativeError && <p className="text-sm text-destructive">공통 소재성과 갱신 실패 · {creativeError}</p>}
        {rows.length > 0 && <ul className="max-h-[55dvh] divide-y overflow-y-auto rounded-lg border">
          {rows.map(row => <li key={row.courseId} className="space-y-1 px-4 py-2">
            <div className="break-words text-sm font-medium">{row.name}</div>
            <div className={row.status === "failed" ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>{row.message}</div>
          </li>)}
        </ul>}
      </DialogContent>
    </Dialog>
  </>;
}
