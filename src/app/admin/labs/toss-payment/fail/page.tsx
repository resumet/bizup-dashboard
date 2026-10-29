import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { RotateCcw, TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { isSuperAdminEmail } from "@/lib/admin/access";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

type FailPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function TossPaymentFailPage({ searchParams }: FailPageProps) {
  const user = await getAuthenticatedUser(await createClient());
  if (!user) redirect("/login");
  if (!isSuperAdminEmail(user.email)) notFound();

  const params = await searchParams;
  const code = first(params.code);
  const message = first(params.message);
  const orderId = first(params.orderId);

  return (
    <main className="min-h-dvh bg-slate-50/70">
      <div className="mx-auto max-w-3xl space-y-6 px-5 py-12 lg:px-8">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">토스 결제 실험 결과</h1>

        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>테스트 결제 인증에 실패했습니다</AlertTitle>
          <AlertDescription>{message || "토스페이먼츠에서 결제 인증을 완료하지 못했습니다."}</AlertDescription>
        </Alert>

        <Card>
          <CardContent className="grid gap-4 p-6">
            <div><p className="text-sm text-muted-foreground">오류 코드</p><p className="mt-1 font-mono text-sm font-semibold">{code || "전달되지 않음"}</p></div>
            <div><p className="text-sm text-muted-foreground">주문번호</p><p className="mt-1 break-all font-mono text-sm">{orderId || "전달되지 않음"}</p></div>
          </CardContent>
        </Card>

        <Button asChild><Link href="/admin/labs/toss-payment"><RotateCcw />다시 실험하기</Link></Button>
      </div>
    </main>
  );
}
