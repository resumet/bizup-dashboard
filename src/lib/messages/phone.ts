export const UNSENDABLE_PHONE_MESSAGE =
  "010-0000-0000 형식이 아닌 전화번호 처리 불가";

export function getPhoneSendError(phone: string) {
  return /^010\d{8}$/.test(phone) ? null : UNSENDABLE_PHONE_MESSAGE;
}
