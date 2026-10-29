export const BUSINESS_TRIP_REPORT_BUCKET = "business-trip-reports";
export const BUSINESS_TRIP_REPORT_MAX_BYTES = 50 * 1024 * 1024;

export const REPORT_FILE_TYPES = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "image/jpeg": "jpg",
  "image/png": "png",
} as const;

const REPORT_EXTENSION_TYPES: Record<string, keyof typeof REPORT_FILE_TYPES> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
};

export function validateBusinessTripFile(input: {
  name: string;
  size: number;
  type: string;
}) {
  if (!input.name.trim() || input.name.length > 255) {
    throw new Error("파일 이름은 255자 이하여야 합니다.");
  }
  if (!Number.isInteger(input.size) || input.size < 1 || input.size > BUSINESS_TRIP_REPORT_MAX_BYTES) {
    throw new Error("출장보고서 파일은 50MB 이하여야 합니다.");
  }
  const fileExtension = input.name.split(".").pop()?.toLowerCase() ?? "";
  const mimeType = input.type in REPORT_FILE_TYPES
    ? input.type as keyof typeof REPORT_FILE_TYPES
    : REPORT_EXTENSION_TYPES[fileExtension];
  const extension = mimeType ? REPORT_FILE_TYPES[mimeType] : undefined;
  if (!extension) {
    throw new Error("PDF, Word, Excel, JPG, PNG 파일만 업로드할 수 있습니다.");
  }
  return { mimeType, extension };
}
