export function nextMetricDate(metricDates: readonly string[], startDate: string, now: Date = new Date()): string {
  const latestDate = metricDates.reduce((latest, date) => date > latest ? date : latest, "");
  if (latestDate) {
    const nextDate = new Date(`${latestDate}T00:00:00Z`);
    nextDate.setUTCDate(nextDate.getUTCDate() + 1);
    return nextDate.toISOString().slice(0, 10);
  }

  return startDate || new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
