export const TOSS_PAYMENT_LAB_AMOUNT = 1_000_000;
export const TOSS_PAYMENT_LAB_ORDER_NAME = "토스 결제 실험 100만원";
export const TOSS_PAYMENT_LAB_ORDER_PREFIX = "LAB-";
export const TOSS_PAYMENT_LAB_CLIENT_KEY = "test_gck_docs_Ovk5rk1EwkEbP0W43n07xlzm";

export function isTossPaymentLabOrderId(value: string) {
  return /^LAB-[0-9]{13}-[0-9a-f]{12}$/u.test(value);
}

export function isTossPaymentLabAmount(value: string) {
  return Number(value) === TOSS_PAYMENT_LAB_AMOUNT;
}
