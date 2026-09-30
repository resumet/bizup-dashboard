"use client";

import { usePathname } from "next/navigation";

import { UserAccountMenu } from "@/components/auth/user-account-menu";
import { BrandHomeLink } from "@/components/layout/brand-home-link";

const YOUTUBE_CHANNELS_ROUTE = "/services/youtube-channels";

function matchesRoute(pathname: string, route: string) {
  return pathname === route || pathname.startsWith(`${route}/`);
}

export function ServiceQuickLinks({
  email,
}: {
  email: string;
}) {
  const pathname = usePathname();
  const isYoutubeChannels = matchesRoute(pathname, YOUTUBE_CHANNELS_ROUTE);

  return (
    <header className={isYoutubeChannels ? "bg-background" : "border-b bg-background"}>
      <div className="mx-auto flex min-h-14 max-w-[1900px] items-center gap-3 px-5 lg:px-8">
        <BrandHomeLink showName={false} />
        {isYoutubeChannels ? (
          <><div className="h-5 w-px shrink-0 bg-border" /><span className="min-w-0 truncate font-semibold">유튜브 채널 관리</span></>
        ) : null}
        <div className="ml-auto"><UserAccountMenu email={email} /></div>
      </div>
    </header>
  );
}
