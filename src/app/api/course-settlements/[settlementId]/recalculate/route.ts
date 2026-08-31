export async function POST() {
  return Response.json(
    { message: "이 재정산 API는 종료되었습니다. 월별 비즈업 엑셀 분석 결과에서 정산서를 작성해 주세요." },
    { status: 410 },
  );
}
