export function chatAudienceAlert(adLeads: number, chatMembers: number | null) {
  if (adLeads <= 0 || chatMembers === null || !Number.isFinite(adLeads) || !Number.isFinite(chatMembers)) return null;
  const rate = chatMembers / adLeads * 100;
  return rate <= 80 ? `톡방 유입 주의 · 광고 DB 대비 ${rate.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}% (${chatMembers.toLocaleString("ko-KR")}명 / ${adLeads.toLocaleString("ko-KR")}건)` : null;
}
