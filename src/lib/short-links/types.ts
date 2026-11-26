// UI field bindings only. The provider's GET /short-link-types is the source of truth.
export const SHORT_LINK_TYPES = {
  landingPageQrLink: {
    typeKey: "landing",
    label: "기본 랜딩 QR",
    sourceField: "landingPageLink",
    sourceLabel: "기본 랜딩페이지",
  },
  paymentLink: {
    typeKey: "payment",
    label: "결제페이지 QR",
    sourceField: "basicPaymentPageLink",
    sourceLabel: "기본 결제페이지",
  },
} as const;

export type ShortLinkField = keyof typeof SHORT_LINK_TYPES;

// Automatically synchronized after a post-sales page has a public URL.
export const POST_SALES_SHORT_LINK_TYPE = { typeKey: "aftersales", label: "사후 세일즈", sourceField: "publicUrl", targetField: "freeGiftLink" } as const;

export function isShortLinkField(field: string): field is ShortLinkField {
  return Object.hasOwn(SHORT_LINK_TYPES, field);
}

export function findShortLinkType(typeKey: string) {
  return [...Object.values(SHORT_LINK_TYPES), POST_SALES_SHORT_LINK_TYPE].find(item => item.typeKey === typeKey);
}

// The provider assigns the key when its operator registers the replay guide.
export const REPLAY_GUIDE_TYPE_LABEL = "강의 다시보기 안내문";
export function registeredReplayType(types: { label: string; key: string; active: boolean }[]) {
  const matches = types.filter(type => type.active && type.label === REPLAY_GUIDE_TYPE_LABEL && !findShortLinkType(type.key));
  return matches.length === 1 ? matches[0] : undefined;
}
