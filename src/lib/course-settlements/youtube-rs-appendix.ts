import type { CourseCost, YoutubeRsChannelDetail } from "@/lib/course-costs/types";
import { escapePrintHtml } from "./print";

const currency = (value: number) => `${Math.round(value).toLocaleString("ko-KR")}원`;

function channelHtml(channel: YoutubeRsChannelDetail) {
  const payers = channel.payers.filter((payer) => payer.included);
  if (!payers.length) return "";
  const paymentTotal = payers.reduce((sum, payer) => sum + payer.paymentAmount, 0);
  const feeTotal = payers.reduce((sum, payer) => sum + payer.feeAmount, 0);
  const rows = payers.map((payer) => `<tr><td>${escapePrintHtml(payer.name)}</td><td>${escapePrintHtml(payer.rsLabel)}</td><td class="number">${currency(payer.paymentAmount)}</td><td class="number">${channel.rsPercent === null ? "미설정" : `${channel.rsPercent}%`}</td><td class="number strong">${currency(payer.feeAmount)}</td></tr>`).join("");
  return `<section class="youtube-rs-channel"><div class="youtube-rs-channel-heading"><h4>${escapePrintHtml(channel.channelName)}</h4><span>${payers.length.toLocaleString("ko-KR")}명</span></div><table class="youtube-rs-table"><thead><tr><th>결제자</th><th>RS 항목</th><th class="number">결제금액</th><th class="number">RS 비율</th><th class="number">수수료</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td colspan="2">채널 합계</td><td class="number">${currency(paymentTotal)}</td><td></td><td class="number strong">${currency(feeTotal)}</td></tr></tfoot></table></section>`;
}

function appearanceFeeCostHtml(cost: CourseCost) {
  if (cost.calculationDetails?.kind !== "YOUTUBE_APPEARANCE_FEE") return "";
  const channels = cost.calculationDetails.channels.filter(
    (channel) => channel.included && channel.appearanceFee !== null,
  );
  if (!channels.length) return "";
  const totals = channels.reduce((sum, channel) => {
    const supplyAmount = channel.appearanceFee ?? 0;
    const vatAmount = Math.round(supplyAmount * 0.1);
    return {
      supplyAmount: sum.supplyAmount + supplyAmount,
      vatAmount: sum.vatAmount + vatAmount,
      finalAmount: sum.finalAmount + supplyAmount + vatAmount,
    };
  }, { supplyAmount: 0, vatAmount: 0, finalAmount: 0 });
  const rows = channels.map((channel) => {
    const supplyAmount = channel.appearanceFee ?? 0;
    const vatAmount = Math.round(supplyAmount * 0.1);
    const linkedChannel = channel.linkedChannelName && channel.linkedChannelName !== channel.channelName
      ? `<small>연결 채널 · ${escapePrintHtml(channel.linkedChannelName)}</small>`
      : "";
    return `<tr><td><strong>${escapePrintHtml(channel.channelName)}</strong>${linkedChannel}</td><td class="number">${currency(supplyAmount)}</td><td class="number">${currency(vatAmount)}</td><td class="number strong">${currency(supplyAmount + vatAmount)}</td></tr>`;
  }).join("");
  return `<article class="youtube-cost"><div class="youtube-cost-heading"><div><h3>${escapePrintHtml(cost.name)}</h3><p>${escapePrintHtml(cost.managerName || "-")} · ${channels.length.toLocaleString("ko-KR")}개 채널</p></div><strong>${currency(cost.grossAmount)}</strong></div><table class="youtube-appearance-table"><thead><tr><th>출연 채널</th><th class="number">공급가액</th><th class="number">부가세 10%</th><th class="number">최종 지급액</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td>출연료 합계</td><td class="number">${currency(totals.supplyAmount)}</td><td class="number">${currency(totals.vatAmount)}</td><td class="number strong">${currency(totals.finalAmount)}</td></tr></tfoot></table></article>`;
}

function rsCostHtml(cost: CourseCost) {
  if (cost.calculationDetails?.kind !== "YOUTUBE_RS") return "";
  const channels = cost.calculationDetails.channels.map(channelHtml).filter(Boolean).join("");
  if (!channels) return "";
  const includedPayers = cost.calculationDetails.channels.flatMap((channel) => channel.payers.filter((payer) => payer.included));
  const paymentTotal = includedPayers.reduce((sum, payer) => sum + payer.paymentAmount, 0);
  const feeTotal = includedPayers.reduce((sum, payer) => sum + payer.feeAmount, 0);
  return `<article class="youtube-cost"><div class="youtube-cost-heading"><div><h3>${escapePrintHtml(cost.name)}</h3><p>${escapePrintHtml(cost.managerName || "-")} · ${includedPayers.length.toLocaleString("ko-KR")}명</p></div><strong>${currency(cost.grossAmount)}</strong></div>${channels}<div class="youtube-rs-grand-total"><span>총 결제금액 ${currency(paymentTotal)}</span><strong>총 RS 수수료 ${currency(feeTotal)}</strong></div></article>`;
}

export function youtubeChannelCostAppendixHtml(costs: CourseCost[]) {
  const appearanceFeeCosts = costs.map(appearanceFeeCostHtml).filter(Boolean);
  const rsCosts = costs.flatMap((cost) => {
    const html = rsCostHtml(cost);
    return html ? [html] : [];
  });
  const costDetails = [...appearanceFeeCosts, ...rsCosts];
  if (!costDetails.length) return "";

  return `<style>
section.youtube-cost-appendix{break-before:page;break-inside:auto}
.youtube-cost-appendix>h2{margin-top:0}
.youtube-cost+.youtube-cost{break-before:page}
.youtube-cost-heading{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin:0 0 14px;padding-bottom:10px;border-bottom:2px solid #1e293b}
.youtube-cost-heading h3{margin:0;font-size:16px}
.youtube-cost-heading p{margin:4px 0 0;color:#667085}
.youtube-cost-heading strong{font-size:17px;white-space:nowrap}
.youtube-appearance-table{width:100%;table-layout:fixed}
.youtube-appearance-table thead{display:table-header-group}
.youtube-appearance-table tr{break-inside:avoid}
.youtube-appearance-table th,.youtube-appearance-table td{white-space:normal;overflow-wrap:anywhere}
.youtube-appearance-table th:first-child{width:40%}
.youtube-appearance-table th:not(:first-child){width:20%}
.youtube-appearance-table td small{display:block;margin-top:3px;color:#667085;font-weight:400}
.youtube-appearance-table .strong{font-weight:700}
.youtube-rs-channel{break-inside:auto;margin-top:18px}
.youtube-rs-channel-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:7px;break-after:avoid}
.youtube-rs-channel-heading h4{margin:0;font-size:13px}
.youtube-rs-channel-heading span{color:#667085}
.youtube-rs-table{width:100%;table-layout:fixed}
.youtube-rs-table thead{display:table-header-group}
.youtube-rs-table tr{break-inside:avoid}
.youtube-rs-table th,.youtube-rs-table td{white-space:normal;overflow-wrap:anywhere}
.youtube-rs-table th:nth-child(1){width:17%}
.youtube-rs-table th:nth-child(2){width:25%}
.youtube-rs-table th:nth-child(3){width:20%}
.youtube-rs-table th:nth-child(4){width:16%}
.youtube-rs-table th:nth-child(5){width:22%}
.youtube-rs-table .strong{font-weight:700}
.youtube-rs-grand-total{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:16px;margin-top:12px;padding:10px 12px;background:#f1f5f9;border-radius:8px;text-align:right}
.youtube-rs-grand-total strong{color:#1d4ed8}
</style><section class="youtube-cost-appendix"><h2>유튜브 채널 출연료 / RS 비용 상세 내역</h2>${costDetails.join("")}</section>`;
}

export const youtubeRsAppendixHtml = youtubeChannelCostAppendixHtml;
