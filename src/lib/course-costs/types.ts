export type CourseCostBurden = "COMPANY" | "INSTRUCTOR" | "SHARED" | "UNCLASSIFIED";
export type CourseCostTaxType = "TAXABLE" | "TAX_FREE" | "ZERO_RATED" | "REVIEW_REQUIRED";
export type CourseCostStatus = "PLANNED" | "PAID" | "CANCELED";
export type CourseCostEvidenceType =
  | "세금계산서"
  | "종이영수증"
  | "카드영수증"
  | "계좌이체 내역"
  | "계약서"
  | "기타";

export type CourseCostAttachment = {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
  uploadedBy: string;
  storagePath: string;
  url: string | null;
};

export type CourseCost = {
  id: string;
  courseId: string;
  categoryCode: string;
  name: string;
  burdenType: CourseCostBurden;
  managerUserId: string | null;
  managerName: string;
  grossAmount: number;
  supplyAmount: number;
  vatAmount: number;
  taxType: CourseCostTaxType;
  paidDate: string;
  status: CourseCostStatus;
  evidenceRequired: boolean;
  evidenceNeedsReview: boolean;
  evidenceTypes: CourseCostEvidenceType[];
  otherEvidenceType: string;
  companyShareRate: number;
  instructorShareRate: number;
  companyShareAmount: number;
  instructorShareAmount: number;
  includeInSettlement: boolean;
  note: string;
  migratedFrom: string | null;
  version: number;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
  attachments: CourseCostAttachment[];
};

export type CourseCostInput = Omit<
  CourseCost,
  | "id"
  | "courseId"
  | "supplyAmount"
  | "vatAmount"
  | "companyShareAmount"
  | "instructorShareAmount"
  | "migratedFrom"
  | "version"
  | "createdBy"
  | "createdAt"
  | "updatedBy"
  | "updatedAt"
  | "attachments"
> & { version?: number };

export type CourseCostAudit = {
  id: number;
  costName: string;
  actorEmail: string;
  action: string;
  createdAt: string;
};

export const COURSE_COST_DEFAULT_CATEGORIES = {
  COMPANY: [
    ["YOUTUBE_FIXED", "유튜브 출연료"],
    ["TEXTBOOK", "교안 제작비"],
    ["DETAIL_PAGE", "상세페이지 제작비"],
    ["STUDIO_PD", "스튜디오 (PD인건비) 비용"],
    ["AD_OPERATION", "광고집행비"],
    ["OFFLINE_VENUE", "오프라인 행사장 대여비"],
  ],
  INSTRUCTOR: [["INSTAGRAM_AGENCY", "인스타그램 대행비"]],
  SHARED: [
    ["YOUTUBE_RS", "유튜브 출연 RS비용"],
    ["GOOGLE_AD", "구글광고비"],
    ["META_AD", "메타광고비"],
  ],
} as const;
