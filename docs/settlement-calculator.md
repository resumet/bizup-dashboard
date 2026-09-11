# 강의 정산 계산기 실행

기존 프로젝트에서 의존성 설치 후 `npm run dev`를 실행합니다.

- 서비스 대시보드 → 간편 도구 → **강의 정산 계산기 → 실행하기**
- 직접 접근: `http://localhost:3000/tools/settlement-calculator` (계산기는 로그인 없이 이용 가능)
- 계산식과 기본값: `src/lib/tools/settlement-calculator.ts`
- 화면과 입력 처리: `src/components/tools/settlement-calculator.tsx`
- 검증: `npx tsx --test src/lib/tools/settlement-calculator.test.ts`

입력은 브라우저 메모리에만 유지합니다. 저장 API나 브라우저 저장소를 사용하지 않으며 새로고침하면 기본값으로 돌아옵니다.

PG 7.5% → 차감 후 노바 3.3% → 공동비용 전액 차감 → 회사·강사 50:50 배분 순서로 계산합니다. 회사분에서만 회사비용을 빼고 강사분에는 VAT 10%를 더합니다. 중간 값은 반올림하지 않습니다.
