import { normalizePhoneForStorage } from "@/lib/import/roster";

export type ManualEnrollmentInput = {
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

export function parseManualEnrollmentInput(
  value: unknown,
): ManualEnrollmentInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("수강생 정보를 확인해 주세요.");
  }

  const body = value as Record<string, unknown>;
  const customerName = clean(body.customerName);
  if (!customerName) throw new Error("이름을 입력해 주세요.");

  const normalizedPhone = normalizePhoneForStorage(body.phone);
  if (!normalizedPhone) {
    throw new Error("숫자가 포함된 연락처를 입력해 주세요.");
  }

  const email = clean(body.email);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("이메일 형식을 확인해 주세요.");
  }

  return {
    customerName,
    normalizedPhone,
    email,
    optionName: clean(body.optionName),
    referrer: clean(body.referrer),
    source: clean(body.source),
    adMedia: clean(body.adMedia),
  };
}
