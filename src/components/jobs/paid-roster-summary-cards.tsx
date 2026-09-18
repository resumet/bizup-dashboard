import { Card, CardContent } from "@/components/ui/card";
import type { PaidRosterSummary } from "@/lib/jobs/paid-roster-summary";

const money = (value: number) =>
  `${value.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}??;

export function PaidRosterSummaryCards({ summary }: { summary: PaidRosterSummary }) {
  return (
    <section aria-label="?좊즺?섍컯??寃곗젣 ?붿빟" className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card role="group" aria-label="?꾩껜 寃곗젣????>
          <CardContent>
            <p className="text-sm text-muted-foreground">?꾩껜 寃곗젣????/p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">
              {summary.payerCount.toLocaleString("ko-KR")}
              <span className="ml-1 text-sm font-normal text-muted-foreground">紐?/span>
            </p>
          </CardContent>
        </Card>
        <Card role="group" aria-label="?꾩껜 寃곗젣湲덉븸">
          <CardContent>
            <p className="text-sm text-muted-foreground">?꾩껜 寃곗젣湲덉븸</p>
            <p className="mt-2 break-all text-2xl font-semibold tabular-nums">
              {money(summary.paymentAmount)}
            </p>
          </CardContent>
        </Card>
      </div>
      {summary.options.length > 0 ? (
        <div className="contents">
          <h2 className="hidden">?듭뀡蹂?寃곗젣????/h2>
          <div className="contents">
            {summary.options.map((option) => (
              <Card key={option.optionName} role="group" aria-label={`${option.optionName} 寃곗젣????}>
                <CardContent>
                  <p className="truncate text-sm text-muted-foreground" title={option.optionName}>
                    {option.optionName}
                  </p>
                  <p className="mt-2 text-2xl font-semibold tabular-nums">
                    {option.payerCount.toLocaleString("ko-KR")}
                    <span className="ml-1 text-sm font-normal text-muted-foreground">紐?/span>
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
