export type PaymentSummaryPatch = {
  cohort?: string;
  novaSettled?: boolean;
  instructorSettled?: boolean;
};

const invalidFormatMessage = "정산 정보 형식이 올바르지 않습니다.";

export function parsePaymentSummaryPatch(value: unknown): PaymentSummaryPatch {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(invalidFormatMessage);
  }

  const input = value as Record<string, unknown>;
  const patch: PaymentSummaryPatch = {};
  if (Object.prototype.hasOwnProperty.call(input, "cohort")) {
    if (typeof input.cohort !== "string" || input.cohort.trim().length > 100) {
      throw new Error(invalidFormatMessage);
    }
    patch.cohort = input.cohort.trim();
  }

  for (const field of ["novaSettled", "instructorSettled"] as const) {
    if (!Object.prototype.hasOwnProperty.call(input, field)) continue;
    if (typeof input[field] !== "boolean") {
      throw new Error(invalidFormatMessage);
    }
    patch[field] = input[field];
  }

  if (!Object.keys(patch).length) throw new Error(invalidFormatMessage);
  return patch;
}

export function buildPaymentSummaryUpdate(patch: PaymentSummaryPatch) {
  return {
    ...(patch.cohort !== undefined ? { cohort: patch.cohort } : {}),
    ...(patch.novaSettled !== undefined ? { nova_settled: patch.novaSettled } : {}),
    ...(patch.instructorSettled !== undefined
      ? { instructor_settled: patch.instructorSettled }
      : {}),
  };
}
