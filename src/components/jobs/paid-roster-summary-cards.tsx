import { Card, CardContent } from "@/components/ui/card";
import type { PaidRosterSummary } from "@/lib/jobs/paid-roster-summary";

const money = (value: number) =>
  `${value.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}원`;

export function PaidRosterSummaryCards({ summary }: { summary: PaidRosterSummary }) {
  return (
    <section aria-label="유료수강생 결제 요약" className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
        <Card role="group" aria-label="부분환불자" className="border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/20">
          <CardContent>
            <p className="text-sm text-muted-foreground">부분환불자</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-blue-700 dark:text-blue-300">
              {summary.partialRefundPayerCount.toLocaleString("ko-KR")}
              <span className="ml-1 text-sm font-normal text-muted-foreground">명</span>
            </p>
            <p className="mt-3 text-sm text-muted-foreground">남은 매출 {money(summary.partialRefundAmount)}</p>
          </CardContent>
        </Card>
        <Card role="group" aria-label="현금결제자 수" className="border-amber-200 bg-amber-50/50">
          <CardContent>
            <p className="text-sm text-muted-foreground">현금결제자 수</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">
              {summary.cashPayerCount.toLocaleString("ko-KR")}
              <span className="ml-1 text-sm font-normal text-muted-foreground">명</span>
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              {summary.cashPayerCount > 0
                ? "현금결제자 포함 여부에 따라 주문내역의 결제자 수와 유료수강생 수가 다를 수 있습니다."
                : "현금결제자로 등록된 수강생이 없습니다."}
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
