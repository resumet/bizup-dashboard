import Link from "next/link";
import {
  ArrowRight,
  BookOpenCheck,
  CalendarRange,
  Camera,
  ChartGantt,
  ChartNoAxesCombined,
  ContactRound,
  FileSpreadsheet,
  HandCoins,
  MessageSquareText,
  PhoneCall,
  ShoppingCart,
  Users,
  UsersRound,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { WORK_SERVICE_CARD_GROUPS } from "@/lib/work/service-card-settings";

type Service = {
  title: string;
  description?: string;
  route: string;
  icon: LucideIcon;
  active?: boolean;
  iconClass: string;
};

const services: Service[] = [
  {
    title: "강사 정보 받기",
    route: "/services/instructor-intakes",
    icon: ContactRound,
    iconClass: "bg-sky-500/12 text-sky-700 ring-sky-500/15 dark:text-sky-300",
  },
  {
    title: "강의 WBS",
    description:
      "강의 준비와 웨비나 업무를 체크리스트와 간트 차트로 관리하고 템플릿으로 재사용합니다.",
    route: "/services/course-wbs",
    icon: ChartGantt,
    iconClass:
      "bg-violet-500/12 text-violet-700 ring-violet-500/15 dark:text-violet-300",
  },
  {
    title: "강의 운영 자동화",
    description:
      "강의 ID를 기준으로 일정, 옵션, 수강생 명단과 문자 제작물을 연결합니다.",
    route: "/services/course-operations",
    icon: BookOpenCheck,
    iconClass:
      "bg-blue-500/12 text-blue-700 ring-blue-500/15 dark:text-blue-300",
  },
  {
    title: "수강생관리 및 정산",
    description:
      "강의별 주문내역, 유료수강생, 비용과 정산을 웨비나 날짜순으로 관리합니다.",
    route: "/services/course-operations/students-settlements",
    icon: UsersRound,
    iconClass:
      "bg-emerald-500/12 text-emerald-700 ring-emerald-500/15 dark:text-emerald-300",
  },
  {
    title: "인스타그램 관리",
    description:
      "강사 문서 작성부터 공개, 리드게이트와 신청자 Excel 다운로드까지 관리합니다.",
    route: "/services/instagram-management",
    icon: Camera,
    iconClass:
      "bg-pink-500/12 text-pink-700 ring-pink-500/15 dark:text-pink-300",
  },
  {
    title: "강의 일정 플래너",
    description:
      "예비 강의 카드를 달력에 배치해 확정된 웨비나와 전체 강의 일정을 한눈에 확인합니다.",
    route: "/services/course-schedule-planner",
    icon: CalendarRange,
    iconClass:
      "bg-amber-500/15 text-amber-700 ring-amber-500/20 dark:text-amber-300",
  },
  {
    title: "라이브 웨비나 대시보드",
    description:
      "강의별 라이브 참여 인원, 결제와 매출을 모아 보고 단계별 전환율과 광고 효율을 비교합니다.",
    route: "/services/course-webinars",
    icon: ChartNoAxesCombined,
    iconClass:
      "bg-cyan-500/12 text-cyan-700 ring-cyan-500/15 dark:text-cyan-300",
  },
  {
    title: "수강생 명단 분석",
    description:
      "엑셀 신청자 명단을 분류·분석하고 알림톡 발송과 맞춤 다운로드까지 관리합니다.",
    route: "/services/course-roster",
    icon: Users,
    iconClass:
      "bg-indigo-500/12 text-indigo-700 ring-indigo-500/15 dark:text-indigo-300",
  },
  {
    title: "주소록 매니저",
    description:
      "Excel 또는 CSV로 주소록을 만들고 연락처를 검색·수정·업데이트합니다.",
    route: "/services/address-books",
    icon: ContactRound,
    iconClass:
      "bg-teal-500/12 text-teal-700 ring-teal-500/15 dark:text-teal-300",
  },
  {
    title: "전화세일즈 명단 만들기",
    description:
      "무료강의 신청자 명단에서 유료강의 신청자를 제외해 전화 세일즈 대상과 콜 인력 비용을 계산합니다.",
    route: "/services/phone-sales-list",
    icon: PhoneCall,
    iconClass:
      "bg-orange-500/12 text-orange-700 ring-orange-500/15 dark:text-orange-300",
  },
  {
    title: "알림톡·문자 자동화",
    description:
      "기존 주소록을 선택하고 템플릿으로 알림톡과 문자를 발송합니다.",
    route: "/services/message-automation",
    icon: MessageSquareText,
    iconClass:
      "bg-rose-500/12 text-rose-700 ring-rose-500/15 dark:text-rose-300",
  },
  {
    title: "강의별 정산",
    description:
      "월별 비즈업 정산 엑셀을 분석하고 강사별 정산표와 최종 정산서를 작성합니다.",
    route: "/services/settlement-analysis",
    icon: HandCoins,
    iconClass:
      "bg-fuchsia-500/12 text-fuchsia-700 ring-fuchsia-500/15 dark:text-fuchsia-300",
  },
  {
    title: "자금 흐름",
    description:
      "현재 통장 잔액과 강의별 입출금, 월 고정지출을 반영해 향후 12개월 회사 자금을 예측합니다.",
    route: "/services/cash-flow",
    icon: WalletCards,
    iconClass:
      "bg-lime-500/15 text-lime-700 ring-lime-500/20 dark:text-lime-300",
  },
  {
    title: "주문결제 매출분석",
    description:
      "주문결제 엑셀을 강의·상품·광고 유입별로 분석하고 환불과 중복 구매자를 확인합니다.",
    route: "/services/purchase-analysis",
    icon: ShoppingCart,
    iconClass:
      "bg-yellow-500/15 text-yellow-700 ring-yellow-500/20 dark:text-yellow-300",
  },
  {
    title: "광고성과",
    description:
      "Google·Meta 광고의 일일성과를 기록하고 소재성과 메뉴로 이동합니다.",
    route: "/services/ad-performance",
    icon: FileSpreadsheet,
    iconClass:
      "bg-red-500/12 text-red-700 ring-red-500/15 dark:text-red-300",
  },
];

const serviceByRoute = new Map(
  services.map((service) => [service.route, service] as const),
);

function ServiceCard({ service }: { service: Service }) {
  const Icon = service.icon;
  return (
    <Card className="group/service-card min-h-64 gap-0 bg-card/95 py-0 transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-lg">
      <CardHeader className="gap-5 px-5 pt-5">
        <span
          className={`grid size-12 shrink-0 place-items-center rounded-xl ring-1 ${service.iconClass}`}
        >
          <Icon className="size-6" strokeWidth={1.8} aria-hidden="true" />
        </span>
        <CardTitle className="min-w-0 text-xl leading-tight font-semibold tracking-tight text-balance">
          <h3>{service.title}</h3>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col px-5 pt-4 pb-5">
        {service.description ? (
          <CardDescription className="line-clamp-4 leading-6 text-pretty">
            {service.description}
          </CardDescription>
        ) : null}
        {service.active !== false ? (
          <Link
            href={service.route}
            aria-label={`${service.title} 실행하기`}
            className="group/link mt-auto inline-flex w-fit items-center gap-1.5 pt-6 font-medium text-foreground underline-offset-4 outline-none transition-colors hover:text-primary focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <span>{service.title}</span>
            <ArrowRight
              className="size-4 transition-transform duration-200 group-hover/link:translate-x-1"
              aria-hidden="true"
            />
          </Link>
        ) : (
          <span className="mt-auto pt-6 font-medium text-muted-foreground">
            준비 중
          </span>
        )}
      </CardContent>
    </Card>
  );
}

export function WorkServiceCards({
  hiddenRoutes: values,
}: {
  hiddenRoutes: string[];
}) {
  const hiddenRoutes = new Set(values);
  const visibleGroups = WORK_SERVICE_CARD_GROUPS.map((group) => ({
    title: group.title,
    services: group.items
      .map((item) => serviceByRoute.get(item.route))
      .filter(
        (service): service is Service =>
          service !== undefined && !hiddenRoutes.has(service.route),
      ),
  })).filter((group) => group.services.length > 0);

  return (
    <>
      {visibleGroups.map((group, index) => (
        <section
          key={group.title}
          className={index === 0 ? "mt-8" : "mt-10 border-t pt-6"}
          aria-label={group.title}
        >
          <h2 className="mb-4 text-xl font-semibold tracking-tight">
            {group.title}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {group.services.map((service) => (
              <ServiceCard key={service.route} service={service} />
            ))}
          </div>
        </section>
      ))}
      {!visibleGroups.length ? (
        <p className="mt-8 rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          표시할 카드가 없습니다. 최고관리자에게 카드 표시 설정을 요청해 주세요.
        </p>
      ) : null}
    </>
  );
}
