import Link from "next/link";
import {
  ArrowLeftRight, ArrowRight, BookOpenCheck, Calculator, CalendarRange, ChartNoAxesCombined,
  CirclePlay, ContactRound, FileCheck2, FileDown, FileSpreadsheet, HandCoins,
  MessageSquareText, PhoneCall, ShoppingCart, Users, WalletCards,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Service = { title: string; description: string; route: string; icon: LucideIcon; active?: boolean; iconClass?: string };

const services: Service[] = [
  { title: "강의 운영 자동화", description: "강의 ID를 기준으로 일정, 옵션, 수강생 명단과 문자 제작물을 연결합니다.", route: "/services/course-operations", icon: BookOpenCheck },
  { title: "강의 일정 플래너", description: "예비 강의 카드를 달력에 배치해 확정된 웨비나와 전체 강의 일정을 한눈에 확인합니다.", route: "/services/course-schedule-planner", icon: CalendarRange },
  { title: "라이브 웨비나 대시보드", description: "강의별 라이브 참여 인원, 결제와 매출을 모아 보고 단계별 전환율과 광고 효율을 비교합니다.", route: "/services/course-webinars", icon: ChartNoAxesCombined },
  { title: "수강생 명단 분석", description: "엑셀 신청자 명단을 분류·분석하고 알림톡 발송과 맞춤 다운로드까지 관리합니다.", route: "/services/course-roster", icon: Users },
  { title: "주소록 매니저", description: "Excel 또는 CSV로 주소록을 만들고 연락처를 검색·수정·업데이트합니다.", route: "/services/address-books", icon: ContactRound },
  { title: "전화세일즈 명단 만들기", description: "무료강의 신청자 명단에서 유료강의 신청자를 제외해 전화 세일즈 대상과 콜 인력 비용을 계산합니다.", route: "/services/phone-sales-list", icon: PhoneCall },
  { title: "알림톡·문자 자동화", description: "기존 주소록을 선택하고 템플릿으로 알림톡과 문자를 발송합니다.", route: "/services/message-automation", icon: MessageSquareText },
  { title: "강의별 정산", description: "월별 비즈업 정산 엑셀을 분석하고 강사별 정산표와 최종 정산서를 작성합니다.", route: "/services/settlement-analysis", icon: HandCoins },
  { title: "자금 흐름", description: "현재 통장 잔액과 강의별 입출금, 월 고정지출을 반영해 향후 12개월 회사 자금을 예측합니다.", route: "/services/cash-flow", icon: WalletCards },
  { title: "주문결제 매출분석", description: "주문결제 엑셀을 강의·상품·광고 유입별로 분석하고 환불과 중복 구매자를 확인합니다.", route: "/services/purchase-analysis", icon: ShoppingCart },
  { title: "광고성과 대시보드", description: "Google·Meta 광고의 노출, 클릭, 접수 DB와 집행비를 날짜별로 기록합니다.", route: "/services/ad-performance", icon: FileSpreadsheet },
];

const quickTools: Service[] = [
  { title: "수강생 명단 중복 검사", description: "선택한 명단에서 중복된 사람과 등장한 명단·원본 행을 확인합니다.", route: "/services/roster-duplicates", icon: ArrowLeftRight, iconClass: "bg-violet-600 text-white" },
  { title: "결제자·수강생 명단 비교", description: "결제자 엑셀·CSV와 여러 수강생 명단을 비교해 양쪽에서 누락된 사람을 찾습니다.", route: "/services/roster-comparison", icon: ArrowLeftRight, iconClass: "bg-cyan-600 text-white" },
  { title: "강의 정산 계산기", description: "가격·판매 수량·비용으로 회사와 강사의 예상 정산금을 바로 계산합니다.", route: "/tools/settlement-calculator", icon: Calculator, iconClass: "bg-indigo-600 text-white" },
  { title: "연락처 CSV 추출", description: "이름·전화번호·이메일 3열을 붙여넣고 CSV로 저장합니다.", route: "/services/contact-csv", icon: FileDown, iconClass: "bg-teal-600 text-white" },
  { title: "유튜브 영상 다운로드", description: "공개 영상 URL을 확인하고 영상 파일로 저장합니다.", route: "/services/youtube-download", icon: CirclePlay, iconClass: "bg-red-600 text-white" },
  { title: "노바 정산서 검증하기", description: "강사별 매출·비용을 계산하고 전체 정산 숫자를 대조합니다.", route: "/services/nova-settlement-validator", icon: FileCheck2, iconClass: "bg-blue-600 text-white" },
];

function ServiceCard({ service }: { service: Service }) {
  const Icon = service.icon;
  return (
    <Card className="gap-4 bg-card/90 transition-shadow hover:shadow-md">
      <CardHeader className="flex min-h-11 flex-row items-center gap-3">
        <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${service.iconClass ?? "bg-primary/10 text-primary"}`}>
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <CardTitle className="min-w-0 text-base font-semibold leading-6"><h3>{service.title}</h3></CardTitle>
      </CardHeader>
      <CardContent className="-mt-1">
        <CardDescription className="leading-6">{service.description}</CardDescription>
      </CardContent>
      <CardContent className="mt-auto flex justify-end">
        {service.active !== false ? (
          <Button asChild size="sm"><Link href={service.route} aria-label={`${service.title} 실행하기`}>실행하기 <ArrowRight aria-hidden="true" /></Link></Button>
        ) : <Button size="sm" disabled>준비 중</Button>}
      </CardContent>
    </Card>
  );
}

export function WorkServiceCards() {
  return <>
    <section className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="서비스 목록">
      {services.map(service => <ServiceCard key={service.route} service={service} />)}
    </section>
    <section className="mt-10 border-t pt-6" aria-label="간편 도구">
      <h2 className="mb-4 text-xl font-semibold tracking-tight">간편 도구</h2>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {quickTools.map(service => <ServiceCard key={service.route} service={service} />)}
      </div>
    </section>
  </>;
}
