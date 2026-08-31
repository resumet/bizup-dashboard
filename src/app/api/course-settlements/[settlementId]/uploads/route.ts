export async function POST() {
  return Response.json(
    { message: "이 업로드 API는 종료되었습니다. 강의별 정산 화면에서 월별 비즈업 .xlsx 파일을 추가해 주세요." },
    { status: 410 },
  );
}
