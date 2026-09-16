export type PaymentFields = Partial<Record<"paymentMethod" | "paymentId" | "paymentAmount" | "rs", string>>;

export function parsePaymentAmount(value: string) {
  const cleaned = value.replace(/[,\s₩원]/gu, "").trim();
  if (!cleaned || cleaned === "-") return "";
  if (!/^\d{1,13}(\.\d{1,2})?$/u.test(cleaned)) throw new Error("결제금액은 0 이상의 숫자로 입력해 주세요. 소수점은 두 자리까지 가능합니다.");
  return String(Number(cleaned));
}

export function formatPaymentAmount(value: string) {
  try {
    const amount = parsePaymentAmount(value);
    return amount === "" ? "" : Number(amount).toLocaleString("ko-KR", { maximumFractionDigits: 2 });
  } catch {
    // Keep invalid input visible so saving can report the validation error.
    return value;
  }
}
