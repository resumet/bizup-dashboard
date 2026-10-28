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
  MessageCircleMore,
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
  getGitHubReleasesUrl,
  getLatestGitHubRelease,
  type GitHubLatestRelease,
  type GitHubReleaseRepository,
} from "@/lib/tools/github-release";

const YOUTUBE_LIVE_RECORDER_REPOSITORY = {
  owner: "resumet",
  repository: "Youtube_live_webinar_recorder",
  cacheTag: "youtube-live-recorder-release",
} satisfies GitHubReleaseRepository;

const KAKAO_TAG_MANAGER_REPOSITORY = {
  owner: "resumet",
  repository: "kakao-opentalk-manager",
  cacheTag: "kakao-opentalk-manager-release",
} satisfies GitHubReleaseRepository;

function ReleaseDownloadCard({
  title,
  description,
  icon: Icon,
  iconClassName,
  release,
  repository,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  iconClassName: string;
  release: GitHubLatestRelease | null;
  repository: GitHubReleaseRepository;
}) {
  return (
    <Card className="h-full">
      <CardContent className="flex min-h-56 flex-col items-center gap-4 p-5 text-center">
        <div className="flex flex-col items-center gap-3">
          <span
            className={`grid size-12 shrink-0 place-items-center rounded-xl ${iconClassName}`}
          >
            <Icon className="size-6" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center justify-center gap-2">
              <h3 className="font-semibold tracking-tight">{title}</h3>
              {release ? (
                <Badge variant="secondary">{release.version}</Badge>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </div>
        </div>

        <div className="mt-auto flex flex-wrap justify-center gap-2">
          {release?.assets.map((asset) => {
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
              href={release?.releaseUrl ?? getGitHubReleasesUrl(repository)}
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
  );
}

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
  const [recorderRelease, kakaoTagManagerRelease] = await Promise.all([
    getLatestGitHubRelease(YOUTUBE_LIVE_RECORDER_REPOSITORY),
    getLatestGitHubRelease(KAKAO_TAG_MANAGER_REPOSITORY),
  ]);

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

      <div className="mx-auto max-w-[1900px] space-y-10 px-5 py-10 lg:px-8">
        <section className="space-y-4" aria-labelledby="online-tools-heading">
          <h2 id="online-tools-heading" className="text-lg font-semibold">
            온라인 도구
          </h2>
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
                    <CardContent className="flex min-h-32 flex-col items-center justify-center gap-3 p-5 text-center">
                      <span
                        className={`grid size-12 shrink-0 place-items-center rounded-xl ${iconClassName}`}
                      >
                        <Icon className="size-6" aria-hidden="true" />
                      </span>
                      <h3 className="font-semibold leading-snug tracking-tight">
                        {label}
                      </h3>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="space-y-4" aria-labelledby="downloads-heading">
          <h2 id="downloads-heading" className="text-lg font-semibold">
            다운로드
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <ReleaseDownloadCard
              title="유튜브 라이브 레코더"
              description="최신 GitHub 릴리즈의 설치 파일을 내려받습니다."
              icon={RadioTower}
              iconClassName="bg-red-500/10 text-red-700"
              release={recorderRelease}
              repository={YOUTUBE_LIVE_RECORDER_REPOSITORY}
            />
            <ReleaseDownloadCard
              title="카카오톡 태그 자동 관리자"
              description="카카오톡 오픈채팅 태그 관리 도구를 내려받습니다."
              icon={MessageCircleMore}
              iconClassName="bg-yellow-400/15 text-yellow-700"
              release={kakaoTagManagerRelease}
              repository={KAKAO_TAG_MANAGER_REPOSITORY}
            />
          </div>
        </section>
      </div>
    </main>
  );
}
