const count = new Intl.NumberFormat("ko-KR");
const won = new Intl.NumberFormat("ko-KR", { style: "currency", currency: "KRW", maximumFractionDigits: 0 });
const leads = new Intl.NumberFormat("ko-KR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const percent = new Intl.NumberFormat("ko-KR", { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 });

const cpl = ["cpl", "CPL", won] as const;
const trafficRateColumns = [
  ["cpm", "CPM", won], ["ctr", "CTR", percent], ["cpc", "CPC", won],
  ["conversionRate", "전환율(클릭→리드)", percent],
] as const;

export const creativeRateColumns = [cpl, ...trafficRateColumns] as const;
export const courseMediaColumns = [
  cpl,
  ["impressions", "노출", count], ["clicks", "클릭", count], ["leads", "리드", leads], ["landing", "랜딩", count],
  ...trafficRateColumns,
] as const;

export const creativeSummaryColumns = [
  ["creatives", "소재 수", count], ["cost", "비용", won], ...courseMediaColumns,
] as const;
