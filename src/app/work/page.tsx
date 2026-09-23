import { redirect } from "next/navigation";
import { Bell, Search } from "lucide-react";
import { UserAccountMenu } from "@/components/auth/user-account-menu";
import { BrandHomeLink } from "@/components/layout/brand-home-link";
import { CourseShortcutsMenu } from "@/components/layout/course-shortcuts-menu";
import { WorkServiceCards } from "@/components/work/service-cards";
import { WorkServiceCardSettingsButton } from "@/components/work/service-card-settings-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { isSuperAdminEmail } from "@/lib/admin/access";
import { DEFAULT_WORK_SERVICE_CARD_SETTINGS } from "@/lib/work/service-card-settings";
import { loadWorkServiceCardSettings } from "@/lib/work/service-card-settings-storage";

export default async function DashboardPage() {
  const supabase = await createClient();
  const currentUser = await getAuthenticatedUser(supabase);

  if (!currentUser) redirect("/login");

  const email = currentUser.email ?? "이메일 정보 없음";
  const cardSettings=await loadWorkServiceCardSettings().catch(()=>DEFAULT_WORK_SERVICE_CARD_SETTINGS);

  return (
    <main className="min-h-screen">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-18 max-w-[1600px] items-center gap-6 px-5 lg:px-8">
          <BrandHomeLink />
          <CourseShortcutsMenu />
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="icon" aria-label="알림">
              <Bell />
            </Button>
            {isSuperAdminEmail(email) ? <WorkServiceCardSettingsButton hiddenRoutes={cardSettings.hiddenRoutes} /> : null}
            <UserAccountMenu email={email} />
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-[1600px] px-5 py-12 lg:px-8 lg:py-16">
        <section className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div>
            <Badge variant="outline" className="mb-4 bg-background/70">
              운영 워크스페이스
            </Badge>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              오늘 어떤 업무를 시작할까요?
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">
              비즈업 운영에 필요한 도구를 한곳에서 실행하고 최근 작업 상태를
              확인하세요.
            </p>
          </div>
          <div className="relative w-full md:w-72">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="bg-background pl-9"
              placeholder="서비스 검색"
              aria-label="서비스 검색"
            />
          </div>
        </section>
        <WorkServiceCards hiddenRoutes={cardSettings.hiddenRoutes} />
      </div>
    </main>
  );
}
