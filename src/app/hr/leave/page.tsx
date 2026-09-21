import { HrLeaveDashboard } from "@/components/hr/hr-leave-dashboard";
import { loadHrLeaveDashboard, requireHrLeaveContext } from "@/lib/hr-leave/server";

export default async function HrLeavePage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const context = await requireHrLeaveContext();
  const currentYear = Number(context.today.slice(0, 4));
  const requestedYear = Number((await searchParams).year);
  const year = Number.isInteger(requestedYear) && requestedYear >= currentYear - 5 && requestedYear <= currentYear + 1
    ? requestedYear
    : currentYear;
  const data = await loadHrLeaveDashboard(context, year);
  return <HrLeaveDashboard key={year} initialData={data} />;
}
