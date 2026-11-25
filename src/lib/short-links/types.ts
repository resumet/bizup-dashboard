// Shared registry: check for an existing type before adding a new purpose.
// These assignments are permanent: Bizup identifies a link by course_id + type.
export const SHORT_LINK_TYPES = {
  landingPageQrLink: {
    type: "0000",
    label: "기본 랜딩 QR",
    sourceField: "landingPageLink",
    sourceLabel: "기본 랜딩페이지",
  },
  paymentLink: {
    type: "0001",
    label: "결제페이지 QR",
    sourceField: "basicPaymentPageLink",
    sourceLabel: "기본 결제페이지",
  },
} as const;

export type ShortLinkField = keyof typeof SHORT_LINK_TYPES;

export function isShortLinkField(field: string): field is ShortLinkField {
  return Object.hasOwn(SHORT_LINK_TYPES, field);
}

export function findShortLinkType(type: string) {
  return Object.values(SHORT_LINK_TYPES).find(item => item.type === type);
}
