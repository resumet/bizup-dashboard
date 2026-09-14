import { timingSafeEqual } from "node:crypto";
import { processHrNotifications } from "@/lib/hr/server";

export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const received = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret ?? ""}`);
  if (!secret || expected.length !== received.length || !timingSafeEqual(expected, received)) return Response.json({ error: "인증이 필요합니다." }, { status: 401 });
  try { return Response.json(await processHrNotifications(), { headers: { "Cache-Control": "no-store" } }); }
  catch { return Response.json({ error: "알림 작업 실패. 다음 실행에서 재시도합니다." }, { status: 503 }); }
}
