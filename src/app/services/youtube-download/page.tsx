import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { YoutubeDownloader } from "@/components/tools/youtube-downloader";
import { Button } from "@/components/ui/button";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export default async function YoutubeDownloadPage() {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) redirect("/login");
  return <main className="min-h-screen"><header className="border-b bg-background"><div className="mx-auto flex h-18 max-w-[1600px] items-center px-5 lg:px-8"><Button variant="ghost" size="sm" asChild><Link href="/"><ArrowLeft /> 서비스</Link></Button><div className="mx-3 h-5 w-px bg-border" /><span className="font-semibold">유튜브 영상 다운로드</span></div></header><div className="mx-auto max-w-[1600px] px-5 py-10 lg:px-8"><YoutubeDownloader /></div></main>;
}
