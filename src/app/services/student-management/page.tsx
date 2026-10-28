import Link from "next/link";
import {
  ArrowLeft,
  BookUser,
  ContactRound,
  MessageSquareText,
  PhoneCall,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

import { BackLink } from "@/components/layout/back-link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const services: ReadonlyArray<{
  title: string;
  href: string;
  icon: LucideIcon;
  iconClassName: string;
}> = [
  {
    title: "수강생 관리 및 정산",
    href: "/services/course-operations/students-settlements",
    icon: UsersRound,
    iconClassName: "bg-emerald-500/10 text-emerald-700",
  },
  {
    title: "수강생 명단 분석",
    href: "/services/course-roster",
    icon: BookUser,
    iconClassName: "bg-indigo-500/10 text-indigo-700",
  },
  {
    title: "주소록 매니저",
    href: "/services/address-books",
    icon: ContactRound,
    iconClassName: "bg-teal-500/10 text-teal-700",
  },
  {
    title: "전화 세일즈 명단",
    href: "/services/phone-sales-list",
    icon: PhoneCall,
    iconClassName: "bg-orange-500/10 text-orange-700",
  },
  {
    title: "알림톡 · 문자 자동화",
    href: "/services/message-automation",
    icon: MessageSquareText,
    iconClassName: "bg-rose-500/10 text-rose-700",
  },
];

export default function StudentManagementPage() {
  return (
    <main className="min-h-screen">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-18 max-w-[1900px] items-center px-5 lg:px-8">
          <Button variant="ghost" size="sm" asChild>
            <BackLink href="/">
              <ArrowLeft />
              뒤로가기
            </BackLink>
          </Button>
          <div className="mx-3 h-5 w-px bg-border" />
          <h1 className="truncate font-semibold">수강생 관리</h1>
        </div>
      </header>

      <div className="mx-auto max-w-[1900px] px-5 py-10 lg:px-8">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {services.map(({ title, href, icon: Icon, iconClassName }) => (
            <Link
              key={href}
              href={href}
              className="group rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
            >
              <Card className="h-full transition-colors group-hover:border-primary/35 group-hover:bg-muted/20">
                <CardContent className="flex min-h-36 items-center gap-4 p-6">
                  <span className={`grid size-12 shrink-0 place-items-center rounded-xl ${iconClassName}`}>
                    <Icon className="size-6" aria-hidden="true" />
                  </span>
                  <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
