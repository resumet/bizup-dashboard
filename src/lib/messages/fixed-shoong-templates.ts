export const FIXED_SHOONG_TEMPLATE_CONTRACTS = {
  paid_confirm: {
    templateCode: "modified_pay_complete_informat",
    sendType: "at",
    variableNames: ["고객명", "강좌명"],
  },
  paid_invite: {
    templateCode: "inivite_paid_kakao_talk",
    sendType: "at",
    variableNames: ["고객명", "강좌명", "입장코드", "링크명"],
  },
} as const;

export type FixedShoongTemplate = keyof typeof FIXED_SHOONG_TEMPLATE_CONTRACTS;

export function getFixedShoongTemplateContract(template: FixedShoongTemplate) {
  return FIXED_SHOONG_TEMPLATE_CONTRACTS[template];
}
