import { analyzeRosterFile, MAX_IMPORT_BYTES } from "@/lib/import/roster";
import { compareRosterRecords } from "@/lib/import/roster-diff";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_IMPORT_BYTES + 1024 * 1024) {
    return Response.json({ message: "파일은 20MB 이하여야 합니다." }, { status: 413 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) return Response.json({ message: "CSV 파일을 선택해 주세요." }, { status: 400 });
    const { preview, records } = await analyzeRosterFile(
      new Uint8Array(await file.arrayBuffer()),
      file.name,
    );
    return Response.json({ ...preview, nameConflicts: compareRosterRecords([], records).nameConflicts.map(({ id, incoming, otherNames }) => ({
      id, rowNumber: incoming.sourceRowNumber, phone: incoming.normalizedPhone,
      name: incoming.normalizedValues.customerName, otherNames,
    })) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "파일을 분석하지 못했습니다.";
    return Response.json({ message }, { status: 400 });
  }
}
