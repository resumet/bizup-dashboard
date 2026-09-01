export const ENROLLMENT_MEMO_MAX_LENGTH = 20;

export function parseEnrollmentMemo(value: unknown) {
  if (typeof value !== "string") {
    throw new Error("비고를 확인해 주세요.");
  }

  const memo = value.trim();
  if (Array.from(memo).length > ENROLLMENT_MEMO_MAX_LENGTH) {
    throw new Error(`비고는 최대 ${ENROLLMENT_MEMO_MAX_LENGTH}글자까지 저장할 수 있습니다.`);
  }

  return memo;
}
