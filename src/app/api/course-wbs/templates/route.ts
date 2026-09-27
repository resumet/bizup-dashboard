export const runtime = "nodejs";

export async function POST() {
  return Response.json({ message: "템플릿은 하나만 저장할 수 있습니다." }, { status: 405 });
}
