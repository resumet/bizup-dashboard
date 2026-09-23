import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, BarChart3, BriefcaseBusiness, CalendarDays, LayoutDashboard, TvMinimalPlay } from "lucide-react";
import { BrandHomeLink } from "@/components/layout/brand-home-link";
import { UserAccountMenu } from "@/components/auth/user-account-menu";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth";

export default async function HomePage() {
  const user = await getAuthenticatedUser(await createClient());
  if (!user) redirect("/login");
  return <main className="min-h-screen">
    <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-6"><BrandHomeLink /><UserAccountMenu email={user.email ?? ""} /></header>
    <section className="mx-auto max-w-5xl px-5 py-12 sm:py-24">
      <p className="text-sm font-semibold tracking-widest text-blue-700">BIZUP WORKSPACE</p>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">어떤 공간에서 시작할까요?</h1>
      <p className="mt-4 text-muted-foreground">업무 운영과 직원의 하루를 한곳에서 관리하세요.</p>
      <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {[
          { href: "/work", name: "대시보드", description: "강의 운영, 수강생 명단, 알림톡·문자와 정산 등 기존 업무 도구를 사용합니다.", icon: LayoutDashboard, color: "bg-blue-50 text-blue-700" },
          { href: "/hr", name: "업무관리", description: "오늘의 업무와 진행 상황, 담당자 이관 내역을 관리합니다.", icon: BriefcaseBusiness, color: "bg-emerald-50 text-emerald-700" },
          { href: "/hr/leave", name: "근태관리", description: "휴가 신청과 부여 현황, 임직원 정보를 확인합니다.", icon: CalendarDays, color: "bg-rose-50 text-rose-700" },
          { href: "/services/ad-performance", name: "광고성과", description: "Google·Meta 광고의 날짜별 노출, 클릭, 접수 DB와 집행비를 기록합니다.", icon: BarChart3, color: "bg-violet-50 text-violet-700" },
          { href: "/services/youtube-channels", name: "유튜브 채널 관리", description: "채널별 공개 영상 성과를 비교하고 분석 이력을 확인합니다.", icon: TvMinimalPlay, color: "bg-red-50 text-red-700" },
        ].map(({ href, name, description, icon: Icon, color }) => <Link key={href} href={href} className="group flex min-w-0 flex-col rounded-lg border bg-white p-7 shadow-sm transition hover:border-blue-400 hover:shadow-md focus-visible:outline-2 focus-visible:outline-blue-600">
          <span className={`inline-flex self-start rounded-lg p-3 ${color}`}><Icon className="size-7" /></span>
          <h2 className="mt-6 text-2xl font-semibold">{name}</h2><p className="mt-3 min-h-14 leading-7 text-muted-foreground">{description}</p>
          <span className="mt-auto flex items-center gap-2 pt-8 text-sm font-medium">{name} 시작하기 <ArrowRight className="size-4 shrink-0 transition group-hover:translate-x-1" /></span>
        </Link>)}
      </div>
    </section>
  </main>;
}
