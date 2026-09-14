import Link from "next/link";
import {
  ArrowLeftRight, ArrowRight, BookOpenCheck, Calculator, ChartNoAxesCombined,
  CirclePlay, ContactRound, FileCheck2, FileDown, FileSpreadsheet, HandCoins,
  MessageSquareText, Palette, PhoneCall, ShoppingCart, Users, WalletCards,
  WandSparkles, type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Service = { title: string; route: string; icon: LucideIcon; active?: boolean; iconClass?: string };

const services: Service[] = [
  { title: "강의 운영 자동화", route: "/services/course-operations", icon: BookOpenCheck },
  { title: "라이브 웨비나 대시보드", route: "/services/course-webinars", icon: ChartNoAxesCombined },
  { title: "수강생 명단 분석", route: "/services/course-roster", icon: Users },
  { title: "주소록 매니저", route: "/services/address-books", icon: ContactRound },
  { title: "전화세일즈 명단 만들기", route: "/services/phone-sales-list", icon: PhoneCall },
  { title: "알림톡·문자 자동화", route: "/services/message-automation", icon: MessageSquareText },
  { title: "문자 생성·제작 프로그램", route: "/services/message-studio", icon: WandSparkles },
  { title: "강의별 정산", route: "/services/settlement-analysis", icon: HandCoins },
  { title: "자금 흐름", route: "/services/cash-flow", icon: WalletCards },
  { title: "주문결제 매출분석", route: "/services/purchase-analysis", icon: ShoppingCart },
  { title: "플친소재 메이커", route: "/services/kakao-ad-maker", icon: Palette },
  { title: "캠페인 성과 리포트", route: "#", icon: FileSpreadsheet, active: false },
];

const quickTools: Service[] = [
  { title: "수강생 명단 중복 검사", route: "/services/roster-duplicates", icon: ArrowLeftRight, iconClass: "bg-violet-600 text-white" },
  { title: "결제자·수강생 명단 비교", route: "/services/roster-comparison", icon: ArrowLeftRight, iconClass: "bg-cyan-600 text-white" },
  { title: "강의 정산 계산기", route: "/tools/settlement-calculator", icon: Calculator, iconClass: "bg-indigo-600 text-white" },
  { title: "연락처 CSV 추출", route: "/services/contact-csv", icon: FileDown, iconClass: "bg-teal-600 text-white" },
  { title: "유튜브 영상 다운로드", route: "/services/youtube-download", icon: CirclePlay, iconClass: "bg-red-600 text-white" },
  { title: "노바 정산서 검증하기", route: "/services/nova-settlement-validator", icon: FileCheck2, iconClass: "bg-blue-600 text-white" },
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
