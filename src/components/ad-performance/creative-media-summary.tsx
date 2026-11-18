import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { summarizeCreativeMedia } from "@/lib/ad-creative/media-summary";
import type { CreativeRow } from "@/lib/ad-creative/model";
import type { AdPerformanceSummary } from "@/lib/ad-performance/types";
import { creativeSummaryColumns } from "./creative-columns";

export type MediaLandingCounts = Pick<AdPerformanceSummary, "googleLandingLeads" | "metaLandingLeads" | "paidLandingLeads">;

export function CreativeMediaSummary({ rows, landingCounts }: { rows: CreativeRow[]; landingCounts: MediaLandingCounts }) {
  const [meta, google, total] = summarizeCreativeMedia(rows);
  function renderRow(row: typeof total, landing: number) {
    const values = { ...row, landing };
    return <TableRow key={row.label}>
      <TableHead scope="row">{row.label}</TableHead>
      {creativeSummaryColumns.map(([key, , format]) => <TableCell key={key} className="text-right tabular-nums">{format.format(values[key])}</TableCell>)}
    </TableRow>;
  }
  return <div className="rounded-lg border bg-background">
    <Table aria-label="매체별 요약">
      <TableHeader><TableRow><TableHead scope="col">매체</TableHead>
        {creativeSummaryColumns.map(([key, label]) => <TableHead key={key} scope="col" className="text-right">{label}</TableHead>)}
      </TableRow></TableHeader>
      <TableBody>{renderRow(meta, landingCounts.metaLandingLeads)}{renderRow(google, landingCounts.googleLandingLeads)}</TableBody>
      <TableFooter>{renderRow(total, landingCounts.paidLandingLeads)}</TableFooter>
    </Table>
  </div>;
}
