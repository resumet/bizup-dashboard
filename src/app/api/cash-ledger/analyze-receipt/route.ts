import { MAX_FILE_SIZE } from "@/lib/cash-ledger/model";
import { analyzeReceipt } from "@/lib/cash-ledger/receipt-server";
import { assertOrigin, context, failure, json, LedgerError } from "@/lib/cash-ledger/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    assertOrigin(request);
    await context();
    if (!request.headers.get("content-type")?.startsWith("multipart/form-data")) throw new LedgerError("이미지 파일을 전송해 주세요.");
    if (Number(request.headers.get("content-length")) > MAX_FILE_SIZE + 64 * 1024) throw new LedgerError("이미지는 4 MB 이하로 붙여넣어 주세요.", 413);
    let form: FormData;
    try { form = await request.formData(); } catch { throw new LedgerError("이미지 파일을 읽지 못했습니다. 다시 붙여넣어 주세요."); }
    const files = form.getAll("file");
    if (files.length !== 1 || !(files[0] instanceof File)) throw new LedgerError("카드 승인 이미지 한 장을 붙여넣어 주세요.");
    return json({ analysis: await analyzeReceipt(files[0], request.signal) });
  } catch (error) { return failure(error); }
}
