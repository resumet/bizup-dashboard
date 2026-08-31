import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { KakaoAdMaker } from "@/components/kakao-ad-maker/kakao-ad-maker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export default async function KakaoAdMakerPage() {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) redirect("/login");
  return <main className="min-h-screen"><header className="border-b bg-background"><div className="mx-auto flex h-18 max-w-[1600px] items-center px-5 lg:px-8"><Button variant="ghost" size="sm" asChild><Link href="/"><ArrowLeft /> 서비스</Link></Button><div className="mx-3 h-5 w-px bg-border" /><span className="font-semibold">플친소재 메이커</span></div></header><div className="mx-auto max-w-[1600px] px-5 py-10 lg:px-8"><Badge variant="outline">KAKAO CREATIVE MAKER</Badge><h1 className="mt-3 text-3xl font-semibold tracking-tight">플친소재 메이커</h1><p className="mt-2 mb-8 text-muted-foreground">강의 정보와 참고 이미지를 바탕으로 OpenAI가 서로 다른 5개 설득 전략의 홍보소재 생성 프롬프트를 만듭니다.</p><KakaoAdMaker /></div></main>;
}
