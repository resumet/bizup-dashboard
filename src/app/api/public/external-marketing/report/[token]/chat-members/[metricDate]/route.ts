import { ZodError } from "zod";
import { savePublicExternalMarketingChatMembers } from "@/lib/external-marketing/public-info-server";

export const runtime = "nodejs";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ token: string; metricDate: string }> },
) {
  try {
    const [{ token, metricDate }, input] = await Promise.all([params, request.json()]);
    const saved = await savePublicExternalMarketingChatMembers(token, { ...input, metricDate });
    if (!saved) {
      return Response.json(
        { message: "공개 링크가 비활성화되었거나 해당 날짜를 찾을 수 없습니다." },
        { status: 404 },
      );
    }
    return Response.json({ saved }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json(
        { message: error.issues[0]?.message ?? "입력값을 확인해 주세요." },
        { status: 400 },
      );
    }
    console.error("공개 단톡방 입장 인원 저장 실패", error);
    return Response.json(
      { message: "단톡방 입장 인원을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요." },
      { status: 500 },
    );
  }
}
