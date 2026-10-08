import type { Metadata } from "next";
import Link from "next/link";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "초대 확인 | BizUp", robots: { index: false, follow: false }, referrer: "no-referrer" };

const messages: Record<string, string> = {
  invalid: "초대 링크가 올바르지 않거나 만료 또는 사용 완료되었습니다. 관리자에게 새 초대 메일을 요청하고 가장 최근에 받은 링크를 열어 주세요.",
  session: "비밀번호를 설정하려면 초대 메일의 링크로 먼저 인증해 주세요. 링크를 이미 사용했거나 인증 시간이 지났다면 관리자에게 새 초대를 요청해 주세요.",
  disabled: "이 계정은 현재 사용할 수 없습니다. 관리자에게 계정 상태를 확인해 주세요.",
  unavailable: "초대를 확인하는 서버에 연결하지 못했습니다. 잠시 후 메일의 링크를 다시 열어 주세요. 계속 실패하면 관리자에게 문의해 주세요.",
};

export default async function InviteErrorPage({ searchParams }: {
  searchParams: Promise<{ reason?: string | string[] }>;
}) {
  const { reason } = await searchParams;
  const message = typeof reason === "string" && Object.hasOwn(messages, reason) ? messages[reason] : messages.invalid;
  return (
    <main className="grid min-h-screen place-items-center px-5 py-12">
      <Card className="w-full max-w-md">
        <CardHeader><h1 className="text-xl font-semibold">초대를 확인할 수 없습니다</h1></CardHeader>
        <CardContent className="space-y-5">
          <Alert variant="destructive"><AlertDescription>{message}</AlertDescription></Alert>
          <Link href="/login" className="inline-flex text-sm font-medium underline underline-offset-4">로그인 화면으로 이동</Link>
        </CardContent>
      </Card>
    </main>
  );
}
