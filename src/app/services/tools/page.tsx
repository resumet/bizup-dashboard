import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowLeft,
  BadgeCheck,
  Calculator,
  Captions,
  ContactRound,
  Download,
  FileSpreadsheet,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

import { BackLink } from "@/components/layout/back-link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { TOOL_HUB_ITEMS } from "@/lib/tools/hub";

const toolAppearance: Record<
  (typeof TOOL_HUB_ITEMS)[number]["href"],
  { icon: LucideIcon; iconClassName: string }
> = {
  "/services/roster-duplicates": {
    icon: UsersRound,
    iconClassName: "bg-indigo-500/10 text-indigo-700",
  },
  "/services/roster-comparison": {
    icon: FileSpreadsheet,
    iconClassName: "bg-sky-500/10 text-sky-700",
  },
  "/tools/settlement-calculator": {
    icon: Calculator,
    iconClassName: "bg-emerald-500/10 text-emerald-700",
  },
  "/services/contact-csv": {
    icon: ContactRound,
    iconClassName: "bg-teal-500/10 text-teal-700",
  },
  "/services/youtube-download": {
    icon: Download,
    iconClassName: "bg-red-500/10 text-red-700",
  },
  "/services/nova-settlement-validator": {
    icon: BadgeCheck,
    iconClassName: "bg-amber-500/10 text-amber-800",
  },
  "/extras": {
    icon: Captions,
    iconClassName: "bg-violet-500/10 text-violet-700",
  },
};

export default async function ToolsPage() {
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
          <h1 className="truncate font-semibold">유용한 도구들</h1>
        </div>
      </header>

      <div className="mx-auto max-w-[1900px] px-5 py-10 lg:px-8">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {TOOL_HUB_ITEMS.map(({ label, href }) => {
            const { icon: Icon, iconClassName } = toolAppearance[href];
            return (
              <Link
                key={href}
                href={href}
                className="group rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
              >
                <Card className="h-full transition-colors group-hover:border-primary/35 group-hover:bg-muted/20">
                  <CardContent className="flex min-h-36 items-center gap-4 p-6">
                    <span
                      className={`grid size-12 shrink-0 place-items-center rounded-xl ${iconClassName}`}
                    >
                      <Icon className="size-6" aria-hidden="true" />
                    </span>
                    <h2 className="text-lg font-semibold tracking-tight">
                      {label}
                    </h2>
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
