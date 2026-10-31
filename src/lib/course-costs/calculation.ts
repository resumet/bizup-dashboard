import type {
  CourseCostBurden,
  CourseCostInput,
  CourseCostTaxType,
} from "./types";
import { parseCourseCostCalculationDetails } from "./calculation-details";
import { youtubeAppearanceFeeTotals } from "./youtube-appearance-fee";
import { youtubeRsTotals } from "./youtube-rs";

export function calculateTax(grossAmount: number, taxType: CourseCostTaxType) {
  const gross = Number.isSafeInteger(grossAmount) && grossAmount >= 0 ? grossAmount : 0;
  if (taxType !== "TAXABLE") return { grossAmount: gross, supplyAmount: gross, vatAmount: 0 };
  const supplyAmount = Math.round(gross / 1.1);
  return { grossAmount: gross, supplyAmount, vatAmount: gross - supplyAmount };
}

export function calculateBurden(
  grossAmount: number,
  burdenType: CourseCostBurden,
  companyShareRate = 50,
) {
  const gross = Math.max(0, Math.round(grossAmount));
  if (burdenType === "COMPANY") {
    return { companyShareRate: 100, instructorShareRate: 0, companyShareAmount: gross, instructorShareAmount: 0 };
  }
  if (burdenType === "INSTRUCTOR") {
    return { companyShareRate: 0, instructorShareRate: 100, companyShareAmount: 0, instructorShareAmount: gross };
  }
  if (burdenType === "UNCLASSIFIED") {
    return { companyShareRate: 0, instructorShareRate: 0, companyShareAmount: 0, instructorShareAmount: 0 };
  }
  const companyRate = Math.min(100, Math.max(0, companyShareRate));
  const companyShareAmount = Math.round(gross * companyRate / 100);
  return {
    companyShareRate: companyRate,
    instructorShareRate: 100 - companyRate,
    companyShareAmount,
    instructorShareAmount: gross - companyShareAmount,
  };
}

export function burdenTypePatch(
  burdenType: Exclude<CourseCostBurden, "UNCLASSIFIED">,
): Pick<CourseCostInput, "burdenType" | "companyShareRate" | "instructorShareRate"> {
  if (burdenType === "COMPANY") {
    return { burdenType, companyShareRate: 100, instructorShareRate: 0 };
  }
  if (burdenType === "INSTRUCTOR") {
    return { burdenType, companyShareRate: 0, instructorShareRate: 100 };
  }
  return { burdenType, companyShareRate: 50, instructorShareRate: 50 };
}

const BURDENS = new Set<CourseCostBurden>(["COMPANY", "INSTRUCTOR", "SHARED", "UNCLASSIFIED"]);
const STATUSES = new Set(["PLANNED", "PAID", "CANCELED"]);

function todayInSeoul() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function parseCourseCostInput(value: unknown): CourseCostInput {
  const input = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
  const calculationDetails = parseCourseCostCalculationDetails(input.calculationDetails);
  const isYoutubeRs = calculationDetails?.kind === "YOUTUBE_RS";
  const isYoutubeAppearanceFee = calculationDetails?.kind === "YOUTUBE_APPEARANCE_FEE";
  const name = isYoutubeRs
    ? "유튜브 RS"
    : isYoutubeAppearanceFee
      ? "유튜브 출연료"
      : typeof input.name === "string" ? input.name.trim() : "";
  const managerName = isYoutubeRs
    ? "유튜브"
    : isYoutubeAppearanceFee
      ? "시스템노바"
      : typeof input.managerName === "string" ? input.managerName.trim() : "";
  const requestedBurden = input.burdenType as CourseCostBurden;
  const burdenType = requestedBurden === "UNCLASSIFIED" ? "COMPANY" : requestedBurden;
  const requestedStatus = String(input.status);
  const autoCompleted = (isYoutubeRs || isYoutubeAppearanceFee) && requestedStatus === "PLANNED";
  const status = autoCompleted ? "PAID" : requestedStatus;
  const grossAmount = isYoutubeRs
    ? youtubeRsTotals(calculationDetails).feeAmount
    : isYoutubeAppearanceFee
      ? youtubeAppearanceFeeTotals(calculationDetails).finalAmount
      : Number(input.grossAmount);
  if (!name || name.length > 100) throw new Error("비용 이름은 1~100자로 입력해 주세요.");
  if (!managerName || managerName.length > 100) throw new Error("담당자를 입력해 주세요.");
  if (!BURDENS.has(requestedBurden)) throw new Error("비용 구분을 확인해 주세요.");
  if (!STATUSES.has(status)) throw new Error("비용 상태를 확인해 주세요.");
  if (!Number.isSafeInteger(grossAmount) || grossAmount < 0) throw new Error("정산금액은 0원 이상 정수여야 합니다.");
  const requestedPaidDate = typeof input.paidDate === "string" ? input.paidDate.trim() : "";
  const paidDate = autoCompleted && !/^\d{4}-\d{2}-\d{2}$/u.test(requestedPaidDate)
    ? todayInSeoul()
    : requestedPaidDate;
  if (status === "PAID" && !/^\d{4}-\d{2}-\d{2}$/u.test(paidDate)) throw new Error("지급완료 비용은 지급연월일이 필요합니다.");
  const companyRate = Number(input.companyShareRate);
  if (burdenType === "SHARED" && (!Number.isFinite(companyRate) || companyRate < 0 || companyRate > 100)) {
    throw new Error("회사 부담률은 0~100%여야 합니다.");
  }
  return {
    categoryCode: isYoutubeRs
      ? "YOUTUBE_RS"
      : isYoutubeAppearanceFee
        ? "YOUTUBE_FIXED"
        : typeof input.categoryCode === "string" ? input.categoryCode.trim().slice(0, 50) || "CUSTOM" : "CUSTOM",
    name,
    burdenType,
    managerUserId: typeof input.managerUserId === "string" && input.managerUserId ? input.managerUserId : null,
    managerName,
    grossAmount,
    taxType: "TAXABLE",
    paidDate: status === "PLANNED" ? "" : paidDate,
    status: status as CourseCostInput["status"],
    evidenceRequired: false,
    evidenceNeedsReview: false,
    evidenceTypes: [],
    otherEvidenceType: "",
    companyShareRate: burdenType === "SHARED" ? companyRate : burdenType === "COMPANY" ? 100 : 0,
    instructorShareRate: burdenType === "SHARED" ? 100 - companyRate : burdenType === "INSTRUCTOR" ? 100 : 0,
    includeInSettlement: true,
    note: "",
    calculationDetails,
    version: Number.isSafeInteger(Number(input.version)) ? Number(input.version) : undefined,
  };
}
