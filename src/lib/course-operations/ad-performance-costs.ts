type AdPerformanceMetricRow = {
  courseId: string | null;
  googleSpend: number | string;
  metaSpend: number | string;
  googleAdLeads: number | string;
  metaAdLeads: number | string;
};

export type CourseAdLeadCosts = {
  googleAdLeadCost: number | null;
  metaAdLeadCost: number | null;
};

function unitCost(spend: number, leads: number) {
  return leads > 0 ? spend / leads : null;
}

export function summarizeCourseAdLeadCosts(rows: readonly AdPerformanceMetricRow[]) {
  const totals = new Map<string, {
    googleSpend: number;
    metaSpend: number;
    googleAdLeads: number;
    metaAdLeads: number;
  }>();

  for (const row of rows) {
    if (!row.courseId) continue;
    const current = totals.get(row.courseId) ?? {
      googleSpend: 0,
      metaSpend: 0,
      googleAdLeads: 0,
      metaAdLeads: 0,
    };
    current.googleSpend += Number(row.googleSpend) || 0;
    current.metaSpend += Number(row.metaSpend) || 0;
    current.googleAdLeads += Number(row.googleAdLeads) || 0;
    current.metaAdLeads += Number(row.metaAdLeads) || 0;
    totals.set(row.courseId, current);
  }

  return new Map<string, CourseAdLeadCosts>(
    [...totals].map(([courseId, total]) => [courseId, {
      googleAdLeadCost: unitCost(total.googleSpend, total.googleAdLeads),
      metaAdLeadCost: unitCost(total.metaSpend, total.metaAdLeads),
    }]),
  );
}
