import {
  buildContactCsv,
  extractContactRows,
  parseClipboardTable,
} from "@/lib/tools/contact-csv";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MAX_TEXT_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_TEXT_BYTES)
    return Response.json(
      { message: "붙여넣은 내용은 10MB 이하여야 합니다." },
      { status: 413 },
    );

  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user)
    return Response.json({ message: "로그인이 필요합니다." }, { status: 401 });

  try {
    const body = (await request.json()) as { text?: unknown };
    const text = typeof body.text === "string" ? body.text : "";
    if (new TextEncoder().encode(text).byteLength > MAX_TEXT_BYTES)
      throw new Error("붙여넣은 내용은 10MB 이하여야 합니다.");

    const table = parseClipboardTable(text);
    const contacts = extractContactRows(table);
    const csv = buildContactCsv(contacts);
    const filename = "붙여넣기_연락처.csv";

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "no-store",
        "X-Extracted-Count": String(contacts.length),
      },
    });
  } catch (error) {
    return Response.json(
      {
        message:
          error instanceof Error ? error.message : "연락처를 추출하지 못했습니다.",
      },
      { status: 400 },
    );
  }
}
