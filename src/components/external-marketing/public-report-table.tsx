import {
  buildExternalMarketingReportRows,
  buildExternalMarketingReportTotalRow,
  type ExternalMarketingReportRow,
} from "@/lib/external-marketing/report";
import type { AdPerformanceDailyMetric } from "@/lib/ad-performance/types";

const number = new Intl.NumberFormat("ko-KR");
const won = new Intl.NumberFormat("ko-KR", { style: "currency", currency: "KRW", maximumFractionDigits: 0 });
function cost(value: number | null) { return value === null ? "—" : won.format(value); }
function rate(value: number | null) { return value === null ? "—" : `${value.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}%`; }

const head = "border-r border-b px-3 py-2 text-center text-xs font-medium whitespace-nowrap last:border-r-0";
const cell = "border-r border-b px-3 py-2 text-right text-xs tabular-nums whitespace-nowrap last:border-r-0";

function ReportRow({ row, total = false }: { row: ExternalMarketingReportRow; total?: boolean }) {
  return <tr className={total ? "bg-muted/80 font-semibold" : "even:bg-muted/20 hover:bg-muted/40"}>
    <th scope="row" className={`${cell} text-left font-medium`}>{row.metricDate}</th>
    <td className={cell}>{number.format(row.impressions)}</td>
    <td className={cell}>{number.format(row.clicks)}</td>
    <td className={cell}>{rate(row.clickConversionRate)}</td>
    <td className={cell}>{rate(row.landingConversionRate)}</td>
    <td className={`${cell} font-semibold`}>{cost(row.spend)}</td>
    <td className={cell}>{number.format(row.landingReceptionDb)}</td>
    <td className={cell}>{row.chatRoomEntrants === null ? "—" : number.format(row.chatRoomEntrants)}</td>
    <td className={cell}>{cost(row.adDbUnitCost)}</td>
    <td className={cell}><span className="block">G {cost(row.googleLandingDbUnitCost)}</span><span className="block">M {cost(row.metaLandingDbUnitCost)}</span></td>
    <td className={cell}>{cost(row.landingReceptionDbUnitCost)}</td>
    <td className={cell}>{cost(row.chatReceptionDbUnitCost)}</td>
  </tr>;
}

export function PublicExternalMarketingReportTable({ metrics }: { metrics: AdPerformanceDailyMetric[] }) {
  const rows = buildExternalMarketingReportRows(metrics);
  const total = rows.length ? buildExternalMarketingReportTotalRow(metrics) : null;
  return <div className="overflow-x-auto rounded-lg border" role="region" aria-label="날짜별 광고집행 결과 표" tabIndex={0}><table className="w-full min-w-[1520px] border-collapse">
    <caption className="sr-only">날짜별 광고 노출, 클릭, 전환율, 광고비, 랜딩접수 DB, 단톡방 입장과 DB 단가</caption>
    <thead className="bg-muted/65 text-muted-foreground"><tr><th className={`${head} text-left`}>날짜</th><th className={head}>총 광고노출</th><th className={head}>광고클릭</th><th className={head}>클릭전환율</th><th className={head}>랜딩전환율</th><th className={head}>광고집행비용</th><th className={head}>랜딩접수DB</th><th className={head}>단톡방 입장</th><th className={head}>광고DB당단가</th><th className={head}>랜딩DB당단가</th><th className={head}>랜딩접수DB단가</th><th className={head}>톡방접수 DB당단가</th></tr></thead>
    <tbody>{total ? <ReportRow row={total} total /> : null}{rows.length ? rows.map((row) => <ReportRow key={row.metricDate} row={row} />) : <tr><td colSpan={12} className="px-5 py-12 text-center text-sm text-muted-foreground">표시할 광고집행 결과가 없습니다.</td></tr>}</tbody>
  </table></div>;
}
