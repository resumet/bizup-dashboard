import { notFound } from "next/navigation";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { guideSchema } from "@/lib/replay-guide/model";
import { GuideView } from "@/components/replay-guide/guide";

export const dynamic = "force-dynamic";
export const metadata = { title: "강의 다시보기 안내문", robots: { index: false, follow: false } };
export default async function PublicGuide({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!z.uuid().safeParse(token).success) notFound();
  const { data, error } = await createAdminClient().from("course_replay_guides").select("published")
    .eq("token", token).eq("public_enabled", true).maybeSingle();
  if (error) throw new Error("안내문을 불러오지 못했습니다.");
  if (!data?.published) notFound();
  return <main className="min-h-dvh bg-muted/40 px-3 py-6 sm:py-12"><GuideView draft={guideSchema.parse(data.published)} /></main>;
}
