export function POST() {
  return Response.json({ message: "출연 요청기획서가 강사정보 받기로 통합되었습니다." }, { status: 410 });
}

export const GET = POST;
