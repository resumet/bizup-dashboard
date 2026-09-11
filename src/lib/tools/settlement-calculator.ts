export const DEFAULTS = Object.freeze({
  price: 2_000_000, quantity: 50, ad: 30_000_000, rs: 10_000_000,
  materials: 1_500_000, youtube: 3_000_000, venue: 2_000_000,
});
export type SettlementInputs = { [K in keyof typeof DEFAULTS]: number };
export const MONEY_KEYS = ["price", "ad", "rs", "materials", "youtube", "venue"] as const;
export type MoneyKey = typeof MONEY_KEYS[number];
export const MAX_MONEY = 1_000_000_000_000;

export function validateValues(values: SettlementInputs) {
  for (const key of MONEY_KEYS) {
    if (!Number.isSafeInteger(values[key]) || values[key] < 0 || values[key] > MAX_MONEY) {
      throw new RangeError(`${key}: 0~${MAX_MONEY} 사이의 정수 금액을 입력해 주세요.`);
    }
  }
  if (!Number.isInteger(values.quantity) || values.quantity < 0 || values.quantity > 100) {
    throw new RangeError("판매 수량은 0~100 사이의 정수여야 합니다.");
  }
  return values;
}

export function calculate(values: SettlementInputs) {
  validateValues(values);
  const { price, quantity, ad, rs, materials, youtube, venue } = values;
  const gross = price * quantity;
  const pg = gross * 75 / 1000;
  const afterPg = gross - pg;
  const fee = afterPg * 33 / 1000;
  const settlement = afterPg - fee;
  const shared = ad + rs;
  const remaining = settlement - shared;
  const half = remaining / 2;
  const execution = ad * 165 / 1000;
  const companyCosts = execution + materials + youtube + venue;
  const companyFinal = half - companyCosts;
  const companyMargin = gross > 0 ? companyFinal / gross * 100 : null;
  const vat = half / 10;
  const instructorFinal = half + vat;
  return { gross, pg, afterPg, fee, settlement, ad, rs, shared, remaining, half, execution, companyCosts, companyFinal, companyMargin, vat, instructorFinal };
}

export function parseMoneyInput(text: string): { value: number; error?: never } | { error: string; value?: never } {
  const trimmed = text.trim();
  if (!trimmed) return { value: 0 };
  if (!/^[\d,]+$/.test(trimmed) || !/\d/.test(trimmed)) {
    return { error: "0 이상의 정수를 입력해 주세요. 현재 결과는 마지막 유효값 기준입니다." };
  }
  const value = Number(trimmed.replaceAll(",", ""));
  if (!Number.isSafeInteger(value) || value > MAX_MONEY) {
    return { error: "1조 원 이하로 입력해 주세요. 현재 결과는 마지막 유효값 기준입니다." };
  }
  return { value };
}

export function formatWon(value: number, showPlus = false) {
  const rounded = Math.round(Math.abs(value));
  const sign = rounded === 0 ? "" : value < 0 ? "−" : showPlus ? "+" : "";
  return `${sign}${rounded.toLocaleString("ko-KR")}원`;
}

export function formatMargin(value: number | null) {
  return value === null ? "계산 불가" : `${value.toFixed(2)}%`;
}

export function configureInputs(current: SettlementInputs, patch: unknown): SettlementInputs {
  if (!patch || typeof patch !== "object" || Array.isArray(patch) || Object.keys(patch).length === 0) {
    throw new Error("변경할 입력값을 하나 이상 전달해 주세요.");
  }
  for (const [key, value] of Object.entries(patch)) {
    if (!Object.hasOwn(DEFAULTS, key) || typeof value !== "number") throw new Error(`유효하지 않은 입력: ${key}`);
  }
  return validateValues({ ...current, ...patch });
}
