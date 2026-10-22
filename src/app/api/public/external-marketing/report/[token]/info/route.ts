import { ZodError } from "zod";
import { savePublicExternalMarketingInfo } from "@/lib/external-marketing/public-info-server";

export const runtime = "nodejs";

export async function PUT(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const [{ token }, input] = await Promise.all([params, request.json()]);
    const info = await savePublicExternalMarketingInfo(token, input);
    if (!info) return Response.json({ message: "공개 링크가 없거나 비활성화되었습니다." }, { status: 404 });
    return Response.json({ info }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ZodError) return Response.json({ message: error.issues[0]?.message ?? "입력값을 확인해 주세요." }, { status: 400 });
    console.error("공개 강의 정보 저장 실패", error);
    return Response.json({ message: "정보를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 500 });
  }
}
