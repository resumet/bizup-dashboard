import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { summarizeCreativeMedia } from "@/lib/ad-creative/media-summary";
import type { CreativeRow } from "@/lib/ad-creative/model";

const count = new Intl.NumberFormat("ko-KR");
const won = new Intl.NumberFormat("ko-KR", { style: "currency", currency: "KRW", maximumFractionDigits: 0 });
const leads = new Intl.NumberFormat("ko-KR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const percent = new Intl.NumberFormat("ko-KR", { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const columns = [
  ["creatives", "소재 수", count], ["cost", "비용", won], ["cpl", "CPL", won],
  ["impressions", "노출", count], ["clicks", "클릭", count], ["leads", "리드", leads],
  ["cpm", "CPM", won], ["ctr", "CTR", percent], ["cpc", "CPC", won],
  ["conversionRate", "전환율(클릭→리드)", percent],
] as const;

export function CreativeMediaSummary({ rows }: { rows: CreativeRow[] }) {
  const [meta, google, total] = summarizeCreativeMedia(rows);
  function renderRow(row: typeof total) {
    return <TableRow key={row.label}>
      <TableHead scope="row">{row.label}</TableHead>
      {columns.map(([key, , format]) => <TableCell key={key} className="text-right tabular-nums">{format.format(row[key])}</TableCell>)}
    </TableRow>;
  }
  return <div className="rounded-lg border bg-background">
    <Table aria-label="매체별 요약">
      <TableHeader><TableRow><TableHead scope="col">매체</TableHead>
        {columns.map(([key, label]) => <TableHead key={key} scope="col" className="text-right">{label}</TableHead>)}
      </TableRow></TableHeader>
      <TableBody>{[meta, google].map(renderRow)}</TableBody>
      <TableFooter>{renderRow(total)}</TableFooter>
    </Table>
  </div>;
}
