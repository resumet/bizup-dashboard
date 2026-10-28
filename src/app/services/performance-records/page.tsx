import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ChartNoAxesCombined, Presentation, type LucideIcon } from "lucide-react";

import { BackLink } from "@/components/layout/back-link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PERFORMANCE_RECORD_HUB_ITEMS } from "@/lib/performance-records/hub";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

const itemAppearance: Record<
  (typeof PERFORMANCE_RECORD_HUB_ITEMS)[number]["href"],
  { icon: LucideIcon; iconClassName: string }
> = {
  "/services/ad-performance": {
    icon: ChartNoAxesCombined,
    iconClassName: "bg-blue-500/10 text-blue-700",
  },
  "/services/external-marketing": {
    icon: Presentation,
    iconClassName: "bg-rose-500/10 text-rose-700",
  },
};

export default async function PerformanceRecordsPage() {
  const user = await getAuthenticatedUser(await createClient());
  if (!user) redirect("/login");

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
          <h1 className="truncate font-semibold">성과기록</h1>
        </div>
      </header>

      <div className="mx-auto max-w-[1900px] px-5 py-10 lg:px-8">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {PERFORMANCE_RECORD_HUB_ITEMS.map(({ label, href }) => {
            const { icon: Icon, iconClassName } = itemAppearance[href];
            return (
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
                    <h2 className="text-lg font-semibold tracking-tight">{label}</h2>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </main>
  );
}
