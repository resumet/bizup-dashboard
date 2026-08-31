export const STANDARD_FIELDS = ["courseName", "optionName", "customerName", "email", "phone", "referrer", "source", "adMedia"] as const;
export type StandardField = (typeof STANDARD_FIELDS)[number];
export const FIELD_LABELS: Record<StandardField, string> = {
  courseName: "강의명", optionName: "옵션명", customerName: "고객명", email: "이메일",
  phone: "전화번호", referrer: "추천인", source: "유입 경로", adMedia: "광고 매체",
};
export type ImportErrorCode = "MISSING_PHONE" | "INVALID_PHONE";
export type ImportPreview = {
  file: { name: string; size: number; checksumSha256: string };
  headers: string[];
  mapping: Partial<Record<StandardField, string>>;
  summary: { totalRows: number; validRows: number; errorRows: number; duplicateGroups: number; duplicateRows: number };
  errors: Array<{ rowNumber: number; code: ImportErrorCode; reason: string; originalValue: string }>;
  preview: Array<Record<StandardField, string>>;
};
