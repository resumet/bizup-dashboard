import { parse } from "csv-parse/sync";
import { readSheet } from "read-excel-file/node";

export async function readComparisonFile(bytes: Uint8Array, fileName: string): Promise<unknown[][]> {
  if (/\.csv$/iu.test(fileName)) {
    let text: string;
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
    catch { throw new Error("CSV를 UTF-8로 저장한 뒤 다시 업로드해 주세요."); }
    try {
      // Keep blank records so the displayed source row numbers remain consistent.
      return parse(text, { bom: true, relax_column_count: true, trim: true }) as string[][];
    } catch { throw new Error("CSV의 따옴표나 쉼표 형식이 올바르지 않습니다. 파일 내용을 확인해 주세요."); }
  }
  if (!/\.xlsx$/iu.test(fileName)) throw new Error(".xlsx 또는 .csv 파일을 선택해 주세요.");
  try { return await readSheet(Buffer.from(bytes), 1) as unknown[][]; }
  catch { throw new Error("엑셀 파일을 읽지 못했습니다. 파일이 손상되었거나 암호가 설정되어 있는지 확인해 주세요."); }
}
