import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  Bell,
  BookOpenCheck,
  CirclePlay,
  ContactRound,
  FileDown,
  FileSpreadsheet,
  HandCoins,
  LayoutGrid,
  MessageSquareText,
  Palette,
  PhoneCall,
  Search,
  ShoppingCart,
  Users,
  WandSparkles,
} from "lucide-react";
import { AdminManagementButton } from "@/components/admin/admin-management-button";
import { UserAccountMenu } from "@/components/auth/user-account-menu";
import { BrandHomeLink } from "@/components/layout/brand-home-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

const services = [
  {
    key: "course-operations",
    title: "강의 운영 자동화",
    description:
      "강의 ID를 기준으로 일정, 옵션, 수강생 명단과 문자 제작물을 연결합니다.",
    active: true,
    route: "/services/course-operations",
    icon: BookOpenCheck,
    meta: "강의 중심 통합 관리",
  },
  {
    key: "course-roster",
    title: "수강생 명단 분석",
    description:
      "엑셀 신청자 명단을 분류·분석하고 알림톡 발송과 맞춤 다운로드까지 관리합니다.",
    active: true,
    route: "/services/course-roster",
    icon: Users,
    meta: "최근 실행 2시간 전",
  },
  {
    key: "address-books",
    title: "주소록 매니저",
    description:
      "Excel 또는 CSV로 주소록을 만들고 연락처를 검색·수정·업데이트합니다.",
    active: true,
    route: "/services/address-books",
    icon: ContactRound,
    meta: "주소록 전용 관리",
  },
  {
    key: "phone-sales-list",
    title: "전화세일즈 명단 만들기",
    description:
      "무료강의 신청자 명단에서 유료강의 신청자를 제외해 전화 세일즈 대상과 콜 인력 비용을 계산합니다.",
    active: true,
    route: "/services/phone-sales-list",
    icon: PhoneCall,
    meta: "무료/유료 명단 차집합",
  },
  {
    key: "message-automation",
    title: "알림톡·문자 자동화",
    description:
      "기존 주소록을 선택하고 템플릿으로 알림톡과 문자를 발송합니다.",
    active: true,
    route: "/services/message-automation",
    icon: MessageSquareText,
    meta: "알림톡·문자 발송",
  },
  {
    key: "message-studio",
    title: "문자 생성·제작 프로그램",
    description:
      "예시 문자 30개를 바탕으로 강의별 신규 마케팅 문자 30개를 AI로 제작합니다.",
    active: true,
    route: "/services/message-studio",
    icon: WandSparkles,
    meta: "강의별 AI 문자 제작",
  },
  {
    key: "settlement-analysis",
    title: "강의별 정산",
    description:
      "월별 비즈업 정산 엑셀을 분석하고 강사별 정산표와 최종 정산서를 작성합니다.",
    active: true,
    route: "/services/settlement-analysis",
    icon: HandCoins,
    meta: "월별 분석·강사 정산서",
  },
  {
    key: "purchase-analysis",
    title: "주문결제 매출분석",
    description:
      "주문결제 엑셀을 강의·상품·광고 유입별로 분석하고 환불과 중복 구매자를 확인합니다.",
    active: true,
    route: "/services/purchase-analysis",
    icon: ShoppingCart,
    meta: "실결제·환불·유입 분석",
  },
  {
    key: "kakao-ad-maker",
    title: "플친소재 메이커",
    description:
      "강의 정보와 참고 이미지를 바탕으로 서로 다른 5개 전략의 홍보소재 생성 프롬프트를 만듭니다.",
    active: true,
    route: "/services/kakao-ad-maker",
    icon: Palette,
    meta: "OpenAI 이미지 프롬프트",
  },
  {
    key: "campaign-report",
    title: "캠페인 성과 리포트",
    description:
      "유입경로와 광고매체별 성과를 연결해 핵심 지표를 빠르게 확인합니다.",
    active: false,
    route: "#",
    icon: FileSpreadsheet,
    meta: "준비 중",
  },
];

export default async function DashboardPage() {
  const supabase = await createClient();
  const currentUser = await getAuthenticatedUser(supabase);

  if (!currentUser) redirect("/login");

  const email = currentUser.email ?? "이메일 정보 없음";

  return (
    <main className="min-h-screen">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-18 max-w-[1600px] items-center gap-6 px-5 lg:px-8">
          <BrandHomeLink />
          <nav className="hidden items-center gap-1 md:flex">
            <Button variant="secondary" size="sm">
              <LayoutGrid />
              서비스
            </Button>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <AdminManagementButton email={email} />
            <Button variant="ghost" size="icon" aria-label="알림">
              <Bell />
            </Button>
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
        <section
          className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3"
          aria-label="서비스 목록"
        >
          {services.map((service) => {
            const Icon = service.icon;
            return (
              <Card
                key={service.key}
                className="group overflow-hidden border-border/80 bg-card/90 transition-all hover:-translate-y-0.5 hover:shadow-lg"
              >
                <CardHeader className="gap-5">
                  <div className="flex items-start justify-between">
                    <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
                      <Icon className="size-5" />
                    </span>
                    <Badge variant={service.active ? "default" : "secondary"}>
                      {service.active ? "사용 가능" : "준비 중"}
                    </Badge>
                  </div>
                  <div>
                    <CardTitle className="text-xl">{service.title}</CardTitle>
                    <CardDescription className="mt-2 min-h-12 leading-6">
                      {service.description}
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="flex items-center justify-between border-t pt-5">
                  <span className="text-xs text-muted-foreground">
                    {service.meta}
                  </span>
                  {service.active ? (
                    <Button asChild size="sm">
                      <Link href={service.route}>
                        실행하기 <ArrowRight />
                      </Link>
                    </Button>
                  ) : (
                    <Button size="sm" disabled>
                      준비 중
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </section>
        <section className="mt-12 border-t pt-8" aria-label="간편 도구">
          <div className="mb-4">
            <Badge
              variant="outline"
              className="border-teal-500/40 bg-teal-500/10 text-teal-700 dark:text-teal-300"
            >
              간편 도구
            </Badge>
            <h2 className="mt-3 text-xl font-semibold tracking-tight">
              빠르게 처리할 작업
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              별도 프로젝트를 만들지 않고 바로 사용할 수 있습니다.
            </p>
          </div>
          <div className="grid max-w-5xl gap-4 md:grid-cols-2"><Card className="border-teal-500/30 bg-teal-500/5 transition-colors hover:bg-teal-500/10">
            <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-teal-600 text-white shadow-sm">
                <FileDown className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">연락처 CSV 추출</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  이름·전화번호·이메일 3열을 붙여넣고 CSV로 저장합니다.
                </p>
              </div>
              <Button
                asChild
                size="sm"
                className="bg-teal-600 text-white hover:bg-teal-700"
              >
                <Link href="/services/contact-csv">
                  실행하기 <ArrowRight />
                </Link>
              </Button>
            </CardContent>
          </Card><Card className="border-red-500/30 bg-red-500/5 transition-colors hover:bg-red-500/10"><CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center"><span className="grid size-10 shrink-0 place-items-center rounded-lg bg-red-600 text-white shadow-sm"><CirclePlay className="size-5" /></span><div className="min-w-0 flex-1"><p className="font-semibold">유튜브 영상 다운로드</p><p className="mt-1 text-sm text-muted-foreground">공개 영상 URL을 확인하고 영상 파일로 저장합니다.</p></div><Button asChild size="sm" className="bg-red-600 text-white hover:bg-red-700"><Link href="/services/youtube-download">실행하기 <ArrowRight /></Link></Button></CardContent></Card></div>
        </section>
        <section className="mt-10 rounded-2xl border bg-card/75 p-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <p className="font-medium">첫 번째 서비스가 준비되었습니다</p>
              <p className="mt-1 text-sm text-muted-foreground">
                수강생 명단 분석에서 새 작업을 만들고 엑셀 가져오기 흐름을
                시작할 수 있습니다.
              </p>
            </div>
            <Button variant="outline" asChild>
              <Link href="/services/course-roster">
                작업 목록 보기 <ArrowRight />
              </Link>
            </Button>
          </div>
        </section>
      </div>
    </main>
  );
}
