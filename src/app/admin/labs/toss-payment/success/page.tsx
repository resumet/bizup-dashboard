import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CheckCircle2, RotateCcw } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { isSuperAdminEmail } from "@/lib/admin/access";
import {
  isTossPaymentLabAmount,
  isTossPaymentLabOrderId,
  TOSS_PAYMENT_LAB_AMOUNT,
} from "@/lib/admin/toss-payment-lab";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

type SuccessPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function maskedPaymentKey(value: string) {
  if (!value) return "전달되지 않음";
  if (value.length <= 12) return `${value.slice(0, 4)}…`;
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

function responseAmountLabel(value: string) {
  const amount = Number(value);
  return value && Number.isFinite(amount) ? `${amount.toLocaleString("ko-KR")}원` : "유효하지 않음";
}

export default async function TossPaymentSuccessPage({ searchParams }: SuccessPageProps) {
  const user = await getAuthenticatedUser(await createClient());
  if (!user) redirect("/login");
  if (!isSuperAdminEmail(user.email)) notFound();

  const params = await searchParams;
  const orderId = first(params.orderId);
  const amount = first(params.amount);
  const paymentKey = first(params.paymentKey);
  const valid = isTossPaymentLabOrderId(orderId) && isTossPaymentLabAmount(amount) && Boolean(paymentKey);

  return (
    <main className="min-h-dvh bg-slate-50/70">
      <div className="mx-auto max-w-3xl space-y-6 px-5 py-12 lg:px-8">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">토스 결제 실험 결과</h1>

        <Alert variant={valid ? "default" : "destructive"}>
          <CheckCircle2 />
          <AlertTitle>{valid ? "테스트 결제 인증에 성공했습니다" : "결제 결과를 검증할 수 없습니다"}</AlertTitle>
          <AlertDescription>{valid ? "인증 정보와 100만원 금액을 확인했습니다. 결제 승인 API는 호출하지 않아 실제 결제로 완료되지 않았습니다." : "주문번호, 금액 또는 결제키가 실험 요청과 일치하지 않습니다. 이 결과로 결제를 승인하지 않습니다."}</AlertDescription>
        </Alert>

        <Card>
          <CardContent className="grid gap-4 p-6 sm:grid-cols-2">
            <div><p className="text-sm text-muted-foreground">요청 금액</p><p className="mt-1 font-semibold tabular-nums">{TOSS_PAYMENT_LAB_AMOUNT.toLocaleString("ko-KR")}원</p></div>
            <div><p className="text-sm text-muted-foreground">응답 금액</p><p className="mt-1 font-semibold tabular-nums">{responseAmountLabel(amount)}</p></div>
            <div className="sm:col-span-2"><p className="text-sm text-muted-foreground">주문번호</p><p className="mt-1 break-all font-mono text-sm">{orderId || "전달되지 않음"}</p></div>
            <div className="sm:col-span-2"><p className="text-sm text-muted-foreground">결제키</p><p className="mt-1 break-all font-mono text-sm">{maskedPaymentKey(paymentKey)}</p></div>
          </CardContent>
        </Card>

        <Button asChild><Link href="/admin/labs/toss-payment"><RotateCcw />다시 실험하기</Link></Button>
      </div>
    </main>
  );
}
