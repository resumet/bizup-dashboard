import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowLeft,
  BadgeCheck,
  Calculator,
  Captions,
  ContactRound,
  Download,
  ExternalLink,
  FileSpreadsheet,
  MonitorPlay,
  RadioTower,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

import { BackLink } from "@/components/layout/back-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { TOOL_HUB_ITEMS } from "@/lib/tools/hub";
import {
  formatReleaseAssetLabel,
  formatReleaseAssetSize,
  getLatestYouTubeLiveRecorderRelease,
  YOUTUBE_LIVE_RECORDER_RELEASES_URL,
} from "@/lib/tools/youtube-live-recorder-release";

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
  "/services/youtube-channels": {
    icon: MonitorPlay,
    iconClassName: "bg-red-500/10 text-red-700",
  },
};

export default async function ToolsPage() {
  const user = await getAuthenticatedUser(await createClient());
  if (!user) redirect("/login");
  const recorderRelease = await getLatestYouTubeLiveRecorderRelease();

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

          <Card className="h-full">
            <CardContent className="flex min-h-36 flex-col gap-5 p-6">
              <div className="flex items-start gap-4">
                <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-red-500/10 text-red-700">
                  <RadioTower className="size-6" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold tracking-tight">
                      유튜브 라이브 레코더
                    </h2>
                    {recorderRelease ? (
                      <Badge variant="secondary">{recorderRelease.version}</Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    최신 GitHub 릴리즈의 설치 파일을 내려받습니다.
                  </p>
                </div>
              </div>

              <div className="mt-auto flex flex-wrap gap-2">
                {recorderRelease?.assets.map((asset) => {
                  const fileSize = formatReleaseAssetSize(asset.size);
                  return (
                    <Button key={asset.downloadUrl} size="sm" asChild>
                      <a
                        href={asset.downloadUrl}
                        target="_blank"
                        rel="noreferrer"
                        title={asset.name}
                      >
                        <Download />
                        {formatReleaseAssetLabel(asset.name)}
                        {fileSize ? (
                          <span className="opacity-70">{fileSize}</span>
                        ) : null}
                      </a>
                    </Button>
                  );
                })}
                <Button variant="outline" size="sm" asChild>
                  <a
                    href={recorderRelease?.releaseUrl ?? YOUTUBE_LIVE_RECORDER_RELEASES_URL}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink />
                    릴리즈 보기
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
