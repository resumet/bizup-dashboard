import { z } from "zod";

const textField = (label: string, max: number) => z.string().trim()
  .min(1, `${label}을(를) 입력해 주세요.`)
  .max(max, `${label}은(는) ${max}자 이내로 입력해 주세요.`)
  .refine((value) => !/[\u0000-\u001f\u007f]/u.test(value), "줄바꿈이나 제어 문자는 입력할 수 없습니다.");

export const REFUND_APPLICATION_REASONS = [
  { value: "A", label: "개인 사정으로 인한 수강 중단" },
  { value: "B", label: "강의 내용이 기대와 다름" },
  { value: "C", label: "일정 또는 시간상의 문제" },
  { value: "D", label: "기타 사유" },
] as const;

export const REFUND_APPLICATION_FRACTIONS = [
  { value: "1/3", label: "1/3" },
  { value: "2/3", label: "2/3" },
] as const;

export type RefundApplicationFraction = (typeof REFUND_APPLICATION_FRACTIONS)[number]["value"];

const refundAmountSchema = z.object({
  paymentAmount: z.string().trim().transform((value) => value.replace(/,/gu, ""))
    .refine((value) => /^\d{1,13}$/u.test(value), "결제금액은 0 이상의 원 단위 정수로 입력해 주세요."),
  refundFraction: z.string().pipe(z.enum(["1/3", "2/3"], { error: "환불 비율을 선택해 주세요." })),
});

export const refundApplicationSchema = z.object({
  ...refundAmountSchema.shape,
  name: textField("이름", 120),
  phone: textField("전화번호", 30).refine(
    (value) => /^[+\d()\s-]+$/u.test(value) && /^\d{8,15}$/u.test(value.replace(/\D/gu, "")),
    "올바른 전화번호를 입력해 주세요.",
  ),
  email: textField("이메일 주소", 254).pipe(z.email("올바른 이메일 주소를 입력해 주세요.")),
  courseName: textField("강의명", 200),
  date: z.iso.date("올바른 날짜를 입력해 주세요.")
    .refine((value) => value >= "1900-01-01" && value <= "9999-12-31", "1900년 이후의 날짜를 입력해 주세요."),
  reason: z.string().pipe(z.enum(["A", "B", "C", "D"], { error: "환불 신청 사유를 선택해 주세요." })),
  reasonDetail: z.string().trim().max(120, "기타 사유는 120자 이내로 입력해 주세요.")
    .refine((value) => !/[\u0000-\u001f\u007f]/u.test(value), "줄바꿈이나 제어 문자는 입력할 수 없습니다."),
}).refine((values) => values.reason !== "D" || Boolean(values.reasonDetail), {
  message: "기타 사유를 입력해 주세요.", path: ["reasonDetail"],
});

export type RefundApplicationInput = z.input<typeof refundApplicationSchema>;

export function refundApplicationAmount(input: Pick<RefundApplicationInput, "paymentAmount" | "refundFraction">) {
  const values = refundAmountSchema.parse(input);
  const numerator = values.refundFraction === "1/3" ? BigInt(1) : BigInt(2);
  // Integer arithmetic avoids floating-point errors; discard fractions of a won.
  return Number(BigInt(values.paymentAmount) * numerator / BigInt(3));
}

export function refundApplicationRecord(input: RefundApplicationInput) {
  const values = refundApplicationSchema.parse(input);
  return {
    refundPaymentAmount: values.paymentAmount,
    refundFraction: values.refundFraction,
    refundAmount: String(refundApplicationAmount(values)),
    refundApplicationDate: values.date,
    refundReason: values.reason,
    refundReasonDetail: values.reasonDetail,
  };
}

export function refundApplicationDate(now = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function refundApplicantSignature(name: string) {
  return `${Array.from(name.normalize("NFC").replace(/\s/gu, "")).join("  ")}   (인)`;
}

export function refundApplicationFilename(input: RefundApplicationInput) {
  const { name, date } = refundApplicationSchema.parse(input);
  return `환불신청서_${name.replace(/[<>:"/\\|?*]/gu, "_").slice(0, 60)}_${date}.pdf`;
}

export function refundApplicationRows(input: RefundApplicationInput): [string, string][] {
  const values = refundApplicationSchema.parse(input);
  const [year, month, day] = values.date.split("-");
  return [
    ["이름", values.name],
    ["전화번호", values.phone],
    ["이메일 주소", values.email],
    ["강의명", values.courseName],
    ["결제금액", `${Number(values.paymentAmount).toLocaleString("ko-KR")}원`],
    ["환불 비율", values.refundFraction],
    ["날짜", `${year}년 ${month}월 ${day}일`],
  ];
}
