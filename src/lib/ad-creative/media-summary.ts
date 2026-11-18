import { filterCreativeRowsByNickname, summarizeCreativeRows, type CreativeRow } from "./model";

function mediaTotals(rows: CreativeRow[]) {
  const totals = summarizeCreativeRows(rows);
  return {
    creatives: new Set(rows.map(row => row.ad)).size,
    cost: totals.cost ?? 0,
    impressions: totals.impressions ?? 0,
    clicks: totals.clicks ?? 0,
    leads: totals.conversions ?? 0,
  };
}

export function calculateCreativeRates(totals: Pick<CreativeRow, "cost" | "impressions" | "clicks" | "conversions">) {
  const cost = totals.cost ?? 0;
  const impressions = totals.impressions ?? 0;
  const clicks = totals.clicks ?? 0;
  const leads = totals.conversions ?? 0;
  return {
    cpl: leads ? cost / leads : 0,
    cpm: impressions ? cost / impressions * 1000 : 0,
    ctr: impressions ? clicks / impressions : 0,
    cpc: clicks ? cost / clicks : 0,
    conversionRate: clicks ? leads / clicks : 0,
  };
}

function withRates(label: string, totals: ReturnType<typeof mediaTotals>) {
  return { label, ...totals, ...calculateCreativeRates({ ...totals, conversions: totals.leads }) };
}

export function summarizeCreativeMedia(rows: CreativeRow[]) {
  const meta = mediaTotals(rows.filter(row => row.platform === "meta"));
  const google = mediaTotals(rows.filter(row => row.platform === "google"));
  return [withRates("Meta", meta), withRates("Google", google), withRates("합계", {
    creatives: meta.creatives + google.creatives,
    cost: meta.cost + google.cost,
    impressions: meta.impressions + google.impressions,
    clicks: meta.clicks + google.clicks,
    leads: meta.leads + google.leads,
  })];
}

export function summarizeCourseMedia(rows: CreativeRow[], nickname: string) {
  const matched = filterCreativeRowsByNickname(rows, nickname);
  if (!matched.length) return null;
  return summarizeCreativeMedia(matched)[2];
}
