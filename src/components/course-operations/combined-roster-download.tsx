"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CombinedCourseRosterRow } from "@/lib/course-operations/types";
import { buildCombinedRosterCsv, buildCombinedRosterXlsx, combinedRosterExportFileName } from "@/lib/course-operations/combined-roster-export";

export function CombinedRosterDownload({ rows, courseName }: { rows: CombinedCourseRosterRow[]; courseName: string }) {
  const [downloading, setDownloading] = useState<"xlsx" | "csv" | null>(null);
  const [error, setError] = useState("");

  async function download(format: "xlsx" | "csv") {
    if (!rows.length || downloading) return;
    setDownloading(format);
    setError("");
    try {
      const blob = format === "xlsx"
        ? await buildCombinedRosterXlsx(rows, courseName)
        : new Blob([buildCombinedRosterCsv(rows, courseName)], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = combinedRosterExportFileName(courseName, rows.length, format);
      document.body.appendChild(anchor);
      try { anchor.click(); }
      finally {
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch {
      setError("파일을 생성하지 못했습니다. 다시 다운로드해 주세요.");
    } finally { setDownloading(null); }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          현재 필터 결과 <strong className="text-foreground">{rows.length.toLocaleString("ko-KR")}명</strong> · 화면에 표시된 순서로 다운로드합니다.
        </p>
        <div className="flex flex-wrap gap-2">
          {(["xlsx", "csv"] as const).map((format) => (
            <Button key={format} type="button" variant="outline" disabled={!rows.length || downloading !== null} onClick={() => void download(format)}>
              {downloading === format ? <Loader2 className="animate-spin" /> : <Download />}
              {format === "xlsx" ? "필터 결과 엑셀" : "필터 결과 CSV"}
            </Button>
          ))}
        </div>
      </div>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
