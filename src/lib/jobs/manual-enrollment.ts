import { normalizePhoneForStorage } from "@/lib/import/roster";
import { parsePaymentAmount, type PaymentFields } from "./payment-fields";

export type ManualEnrollmentInput = PaymentFields & {
  customerName: string;
  normalizedPhone: string;
  email: string;
  optionName: string;
  referrer: string;
  source: string;
  adMedia: string;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function parseManualEnrollmentName(value: unknown) {
  const name = clean(value);
  if (!name) throw new Error("이름을 입력해 주세요.");
  if (name.length > 120) throw new Error("이름은 120자 이하여야 합니다.");
  return name;
}

export function parseManualEnrollmentInput(
  value: unknown,
): ManualEnrollmentInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("수강생 정보를 확인해 주세요.");
  }

  const body = value as Record<string, unknown>;
  const customerName = parseManualEnrollmentName(body.customerName);

  const normalizedPhone = normalizePhoneForStorage(body.phone);
  if (!normalizedPhone) {
    throw new Error("숫자가 포함된 연락처를 입력해 주세요.");
  }

  const email = clean(body.email);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("이메일 형식을 확인해 주세요.");
  }

  return {
    ...Object.fromEntries(["paymentMethod", "paymentId", "rs"].filter((key) => typeof body[key] === "string").map((key) => [key, clean(body[key])])),
    ...(typeof body.paymentAmount === "string" ? { paymentAmount: parsePaymentAmount(body.paymentAmount) } : {}),
    customerName,
    normalizedPhone,
    email,
    optionName: clean(body.optionName),
    referrer: clean(body.referrer),
    source: clean(body.source),
    adMedia: clean(body.adMedia),
  };
}
