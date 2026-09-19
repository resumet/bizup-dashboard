import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, BriefcaseBusiness, UsersRound } from "lucide-react";
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
      <div className="mt-10 grid gap-5 sm:grid-cols-2">
        {[
          { href: "/work", name: "업무관리", description: "강의 운영, 수강생 명단, 알림톡·문자와 정산 등 기존 업무 도구를 사용합니다.", icon: BriefcaseBusiness, color: "bg-blue-50 text-blue-700" },
          { href: "/hr", name: "HR", description: "오늘의 업무를 기록하고 완료 여부와 담당자 이관 내역을 관리합니다.", icon: UsersRound, color: "bg-emerald-50 text-emerald-700" },
        ].map(({ href, name, description, icon: Icon, color }) => <Link key={href} href={href} className="group rounded-2xl border bg-white p-7 shadow-sm transition hover:border-blue-400 hover:shadow-md focus-visible:outline-2 focus-visible:outline-blue-600 sm:p-9">
          <span className={`inline-flex rounded-xl p-3 ${color}`}><Icon className="size-7" /></span>
          <h2 className="mt-6 text-2xl font-semibold">{name}</h2><p className="mt-3 min-h-14 leading-7 text-muted-foreground">{description}</p>
          <span className="mt-8 flex items-center gap-2 text-sm font-medium">{name} 시작하기 <ArrowRight className="size-4 transition group-hover:translate-x-1" /></span>
        </Link>)}
      </div>
    </section>
  </main>;
}
