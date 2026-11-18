import { summarizeCreativeRows, type CreativeRow } from "./model";

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

function withRates(label: string, totals: ReturnType<typeof mediaTotals>) {
  const { cost, impressions, clicks, leads } = totals;
  return {
    label, ...totals,
    cpl: leads ? cost / leads : 0,
    cpm: impressions ? cost / impressions * 1000 : 0,
    ctr: impressions ? clicks / impressions : 0,
    cpc: clicks ? cost / clicks : 0,
    conversionRate: clicks ? leads / clicks : 0,
  };
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
