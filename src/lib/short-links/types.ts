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

// free_chat is the provider's existing switchable chat / YouTube / Zoom type.
export const FREE_CHAT_TYPE_KEY = "free_chat";
// Room 2 continues to use its separately registered provider type.
export const CHAT_SHORT_LINKS = {
  freeKakaoRoom1ShortLink: { label: "무료단톡방1 단축주소", sourceLabel: "무료단톡방1", sourceField: "freeKakaoRoom1Link", column: "free_kakao_room_1_link" },
  freeKakaoRoom2ShortLink: { label: "무료단톡방2 단축주소", sourceLabel: "무료단톡방2", sourceField: "freeKakaoRoom2Link", column: "free_kakao_room_2_link" },
} as const;

export type ChatShortLinkField = keyof typeof CHAT_SHORT_LINKS;
export function isChatShortLinkField(field: string): field is ChatShortLinkField {
  return Object.hasOwn(CHAT_SHORT_LINKS, field);
}

// Automatically synchronized after a post-sales page has a public URL.
export const POST_SALES_SHORT_LINK_TYPE = { typeKey: "aftersales", label: "사후 세일즈", sourceField: "publicUrl", targetField: "freeGiftLink" } as const;

export function isShortLinkField(field: string): field is ShortLinkField {
  return Object.hasOwn(SHORT_LINK_TYPES, field);
}

export function findShortLinkType(typeKey: string) {
  return [...Object.values(SHORT_LINK_TYPES), POST_SALES_SHORT_LINK_TYPE, {
    typeKey: FREE_CHAT_TYPE_KEY, label: CHAT_SHORT_LINKS.freeKakaoRoom1ShortLink.label, sourceField: "freeKakaoRoom1Link",
  }].find(item => item.typeKey === typeKey);
}

// The provider assigns the key when its operator registers the replay guide.
export const REPLAY_GUIDE_TYPE_LABEL = "강의 다시보기 안내문";
export function registeredReplayType(types: { label: string; key: string; active: boolean }[]) {
  const matches = types.filter(type => type.active && type.label === REPLAY_GUIDE_TYPE_LABEL && !findShortLinkType(type.key));
  return matches.length === 1 ? matches[0] : undefined;
}
