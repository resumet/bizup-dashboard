import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";

import {
  instagramMaterialNotionUrlSchema,
  instagramMaterialPositionSchema,
  toPublicNotionEmbedUrl,
} from "@/lib/course-operations/instagram-materials";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ shareId: string; position: string }> };

export const metadata: Metadata = {
  title: "인스타그램 자료",
  robots: { index: false, follow: false, nocache: true },
};

export default async function PublicInstagramNotionPage({ params }: Props) {
  const { shareId, position: rawPosition } = await params;
  const positionResult = instagramMaterialPositionSchema.safeParse(Number(rawPosition));
  if (!positionResult.success) notFound();
  const position = positionResult.data;
  const admin = createAdminClient();
  const { data: share, error: shareError } = await admin
    .from("course_instagram_shares")
    .select("course_id")
    .eq("public_id", shareId)
    .eq("is_public", true)
    .maybeSingle();
  if (shareError || !share) notFound();

  const [courseResult, materialResult] = await Promise.all([
    admin.from("courses").select("name,instructor_name").eq("id", share.course_id).maybeSingle(),
    admin.from("course_instagram_materials").select("title,notion_url").eq("course_id", share.course_id).eq("position", position).maybeSingle(),
  ]);
  if (courseResult.error || materialResult.error || !courseResult.data || !materialResult.data) notFound();
  const notionUrlResult = instagramMaterialNotionUrlSchema.safeParse(materialResult.data.notion_url);
  if (!notionUrlResult.success || !notionUrlResult.data) notFound();

  const title = materialResult.data.title || `${position}번 자료`;
  const notionUrl = notionUrlResult.data;
  const embedUrl = toPublicNotionEmbedUrl(notionUrl);
  if (!embedUrl) notFound();

  return <main className="flex min-h-screen flex-col bg-muted/20">
    <header className="border-b bg-background">
      <div className="mx-auto flex w-full max-w-[96rem] flex-wrap items-center justify-between gap-4 px-5 py-5 lg:px-8">
        <div className="flex items-center gap-2">
          <Link className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" href={`/public/instagram/${shareId}`} aria-label="전체 자료로 돌아가기" title="전체 자료로 돌아가기"><ArrowLeft className="size-4" aria-hidden="true" /><span className="sr-only">전체 자료로 돌아가기</span></Link>
          <div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {courseResult.data.instructor_name ? <p className="mt-1 text-sm text-muted-foreground">강사 {courseResult.data.instructor_name}</p> : null}
          </div>
        </div>
        <a className="inline-flex h-9 items-center justify-center gap-2 rounded-md border bg-background px-4 text-sm font-medium shadow-xs transition-colors hover:bg-muted" href={notionUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="size-4" />Notion에서 열기</a>
      </div>
    </header>
    <section className="mx-auto flex w-full max-w-[96rem] flex-1 p-3 sm:p-5 lg:p-8">
      <iframe
        allow="clipboard-read; clipboard-write; fullscreen"
        className="min-h-[70vh] w-full flex-1 rounded-xl border bg-white shadow-sm"
        loading="eager"
        referrerPolicy="strict-origin-when-cross-origin"
        sandbox="allow-downloads allow-forms allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"
        src={embedUrl}
        title={`${title} Notion 공개 페이지`}
      />
    </section>
  </main>;
}
