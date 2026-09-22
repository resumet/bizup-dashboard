import "server-only";
import readXlsxFile from "read-excel-file/node";
import type { SupabaseClient } from "@supabase/supabase-js";
import { analyzeWorkbook, aggregateMonthlyAnalyses, type MonthlyAnalysis, type WorkbookInput } from "./engine";

export async function loadComparisonMonths(admin: SupabaseClient, settlementId: string) {
  const months: MonthlyAnalysis[] = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await admin.from("course_settlement_uploads")
      .select("id,original_filename,storage_path,analysis_snapshot")
      .eq("settlement_id", settlementId).eq("source_type", "workbook").eq("is_active", true)
      .order("created_at").order("id").range(offset, offset + 99);
    if (error) throw new Error("정산 원본 목록을 조회하지 못했습니다.");
    for (const upload of data ?? []) {
      const snapshot = upload.analysis_snapshot as MonthlyAnalysis | null;
      const hasIds = snapshot?.detailsByInstructor && Object.values(snapshot.detailsByInstructor).every(detail => detail.toss.every(row => typeof row.buyerId === "string"));
      if (hasIds) { months.push(snapshot!); continue; }
      if (!upload.storage_path) throw new Error(`${upload.original_filename}: 구매자 ID 확인에 필요한 원본 엑셀이 없습니다. 다시 업로드해 주세요.`);
      const file = await admin.storage.from("course-settlement-files").download(upload.storage_path);
      if (file.error || !file.data) throw new Error(`${upload.original_filename}: 정산 원본을 읽지 못했습니다.`);
      const sheets = await readXlsxFile(Buffer.from(await file.data.arrayBuffer())) as unknown as WorkbookInput["sheets"];
      months.push(analyzeWorkbook({ fileName: upload.original_filename, fileSize: file.data.size, inputOrder: months.length, sheets }));
    }
    if (!data || data.length < 100) break;
  }
  // Read-only: never overwrite confirmed settlement snapshots during comparison.
  return months.length ? aggregateMonthlyAnalyses(months).monthlyAnalyses : [];
}
