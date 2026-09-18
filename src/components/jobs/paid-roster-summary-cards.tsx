import { Card, CardContent } from "@/components/ui/card";
import type { PaidRosterSummary } from "@/lib/jobs/paid-roster-summary";

const money = (value: number) =>
  `${value.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}원`;

export function PaidRosterSummaryCards({ summary }: { summary: PaidRosterSummary }) {
  return (
    <section aria-label="유료수강생 결제 요약" className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card role="group" aria-label="전체 결제자 수">
          <CardContent>
            <p className="text-sm text-muted-foreground">전체 결제자 수</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">
              {summary.payerCount.toLocaleString("ko-KR")}
              {summary.options.length > 0 ? (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  ({summary.options.map((option) => `${option.optionName} ${option.payerCount.toLocaleString("ko-KR")}명`).join(" / ")})
                </span>
              ) : null}
              <span className="ml-1 text-sm font-normal text-muted-foreground">명</span>
            </p>
          </CardContent>
        </Card>
        <Card role="group" aria-label="전체 결제금액">
          <CardContent>
            <p className="text-sm text-muted-foreground">전체 결제금액</p>
            <p className="mt-2 break-all text-2xl font-semibold tabular-nums">
              {money(summary.paymentAmount)}
            </p>
          </CardContent>
        </Card>
      </div>
      {summary.options.length > 0 ? (
        <div className="hidden">
          <h2 className="text-sm font-medium text-muted-foreground">옵션별 결제자 수</h2>
          <div className="contents">
            {summary.options.map((option) => (
              <Card key={option.optionName} role="group" aria-label={`${option.optionName} 결제자 수`}>
                <CardContent>
                  <p className="truncate text-sm text-muted-foreground" title={option.optionName}>
                    {option.optionName}
                  </p>
                  <p className="mt-2 text-2xl font-semibold tabular-nums">
                    {option.payerCount.toLocaleString("ko-KR")}
                    <span className="ml-1 text-sm font-normal text-muted-foreground">명</span>
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
