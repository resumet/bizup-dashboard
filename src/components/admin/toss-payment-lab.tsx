"use client";

import { useEffect, useRef, useState } from "react";
import {
  ANONYMOUS,
  loadTossPayments,
  type TossPaymentsWidgets,
} from "@tosspayments/tosspayments-sdk";
import { CircleDollarSign, CreditCard, Loader2, ShieldCheck } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  TOSS_PAYMENT_LAB_AMOUNT,
  TOSS_PAYMENT_LAB_CLIENT_KEY,
  TOSS_PAYMENT_LAB_ORDER_NAME,
  TOSS_PAYMENT_LAB_ORDER_PREFIX,
} from "@/lib/admin/toss-payment-lab";

type TossPaymentWindow = Awaited<ReturnType<TossPaymentsWidgets["renderPaymentWindow"]>>;

function errorMessage(error: unknown) {
  if (error && typeof error === "object") {
    const value = error as { code?: unknown; message?: unknown };
    const code = typeof value.code === "string" ? value.code : "";
    const message = typeof value.message === "string" ? value.message : "";
    if (code && message) return `${message} (${code})`;
    if (message) return message;
  }
  return "토스 결제창을 열지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

function createOrderId() {
  const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
  return `${TOSS_PAYMENT_LAB_ORDER_PREFIX}${Date.now()}-${suffix}`;
}

export function TossPaymentLab() {
  const widgetsRef = useRef<TossPaymentsWidgets | null>(null);
  const paymentWindowRef = useRef<TossPaymentWindow | null>(null);
  const [ready, setReady] = useState(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("토스페이먼츠 테스트 SDK를 준비하고 있습니다.");

  useEffect(() => {
    let active = true;
    void loadTossPayments(TOSS_PAYMENT_LAB_CLIENT_KEY).then((tossPayments) => {
      if (!active) return;
      widgetsRef.current = tossPayments.widgets({ customerKey: ANONYMOUS });
      setReady(true);
      setStatus("결제 실험을 시작할 수 있습니다.");
    }).catch((reason: unknown) => {
      if (!active) return;
      setError(errorMessage(reason));
      setStatus("SDK 준비에 실패했습니다.");
    });

    return () => {
      active = false;
      const paymentWindow = paymentWindowRef.current;
      paymentWindowRef.current = null;
      if (paymentWindow) void paymentWindow.destroy().catch(() => undefined);
    };
  }, []);

  async function startPayment() {
    const widgets = widgetsRef.current;
    if (!widgets || opening) return;

    setOpening(true);
    setError("");
    setStatus("100만원 테스트 결제창을 준비하고 있습니다.");
    try {
      if (paymentWindowRef.current) {
        await paymentWindowRef.current.destroy();
        paymentWindowRef.current = null;
      }

      await widgets.setAmount({ value: TOSS_PAYMENT_LAB_AMOUNT, currency: "KRW" });
      const orderId = createOrderId();
      const paymentWindow = await widgets.renderPaymentWindow({
        orderName: TOSS_PAYMENT_LAB_ORDER_NAME,
        variantKey: { paymentMethod: "DEFAULT", agreement: "AGREEMENT" },
      });
      paymentWindowRef.current = paymentWindow;

      paymentWindow.on("cancel", async () => {
        paymentWindowRef.current = null;
        setStatus("결제 시도를 취소했습니다.");
      });
      paymentWindow.on("paymentRequest", async () => {
        setStatus("선택한 결제수단으로 테스트 인증을 요청하고 있습니다.");
        try {
          await widgets.requestPayment({
            orderId,
            orderName: TOSS_PAYMENT_LAB_ORDER_NAME,
            successUrl: `${window.location.origin}/admin/labs/toss-payment/success`,
            failUrl: `${window.location.origin}/admin/labs/toss-payment/fail`,
          });
        } catch (reason) {
          setError(errorMessage(reason));
          setStatus("결제 인증 요청을 완료하지 못했습니다.");
        }
      });
      setStatus("결제수단을 선택한 뒤 토스 결제창의 결제하기 버튼을 눌러주세요.");
    } catch (reason) {
      setError(errorMessage(reason));
      setStatus("결제창을 열지 못했습니다.");
    } finally {
      setOpening(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <Card className="border-slate-200 bg-white">
        <CardContent className="space-y-6 p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="grid size-12 place-items-center rounded-xl bg-blue-50 text-blue-700">
                <CreditCard className="size-6" aria-hidden="true" />
              </span>
              <strong className="text-lg text-slate-950">결제창형 테스트</strong>
            </div>
            <Badge variant="secondary" className="bg-emerald-50 text-emerald-700">TEST MODE</Badge>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <p className="text-sm font-medium text-slate-500">결제 시도 금액</p>
            <p className="mt-2 text-4xl font-semibold tracking-tight text-slate-950 tabular-nums">1,000,000원</p>
          </div>

          <Alert>
            <ShieldCheck />
            <AlertTitle>실제 결제가 발생하지 않습니다</AlertTitle>
            <AlertDescription>토스페이먼츠 공식 문서용 테스트 키를 사용하며, 성공 후 결제 승인 API도 호출하지 않습니다.</AlertDescription>
          </Alert>

          {error ? <Alert variant="destructive"><AlertTitle>결제 시도를 시작할 수 없습니다</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}

          <div className="space-y-2">
            <Button type="button" size="lg" className="w-full" disabled={!ready || opening} onClick={() => void startPayment()}>
              {opening ? <Loader2 className="animate-spin" /> : <CircleDollarSign />}
              {opening ? "결제창 준비 중" : "1,000,000원 결제 시도"}
            </Button>
            <p className="text-center text-sm text-muted-foreground" role="status" aria-live="polite">{status}</p>
          </div>
        </CardContent>
      </Card>

      <Card className="h-fit border-slate-200 bg-white">
        <CardContent className="space-y-4 p-6 text-sm text-slate-600">
          <strong className="block text-base text-slate-950">실험 흐름</strong>
          <ol className="space-y-3">
            {["결제 금액을 100만원으로 설정", "토스 결제창에서 결제수단 선택", "테스트 결제 인증 요청", "결과 확인 후 승인 없이 종료"].map((item, index) => (
              <li key={item} className="flex gap-3"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700">{index + 1}</span><span className="pt-0.5">{item}</span></li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
