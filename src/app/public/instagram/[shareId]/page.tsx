import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Images } from "lucide-react";

import { PublicInstagramMaterials } from "@/components/course-operations/public-instagram-materials";
import { toInstagramMaterial } from "@/lib/course-operations/instagram-materials-server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ shareId: string }> };

export const metadata: Metadata = {
  title: "인스타그램 자료 입력",
  robots: { index: false, follow: false, nocache: true },
};

export default async function PublicInstagramMaterialsPage({ params }: Props) {
  const { shareId } = await params;
  const admin = createAdminClient();
  const { data: share, error: shareError } = await admin
    .from("course_instagram_shares")
    .select("course_id")
    .eq("public_id", shareId)
    .eq("is_public", true)
    .maybeSingle();
  if (shareError || !share) notFound();

  const [courseResult, materialsResult] = await Promise.all([
    admin.from("courses").select("name,instructor_name").eq("id", share.course_id).maybeSingle(),
    admin.from("course_instagram_materials").select("position,title,notion_url").eq("course_id", share.course_id).order("position"),
  ]);
  if (courseResult.error || materialsResult.error || !courseResult.data) notFound();

  return <main className="min-h-screen bg-muted/20">
    <header className="border-b bg-background"><div className="mx-auto max-w-6xl px-5 py-7 lg:px-8"><div className="flex items-start gap-3"><span className="mt-1 grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><Images className="size-5" /></span><div><p className="text-sm text-muted-foreground">강사 자료 입력</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">{courseResult.data.name}</h1>{courseResult.data.instructor_name ? <p className="mt-1 text-sm text-muted-foreground">강사 {courseResult.data.instructor_name}</p> : null}</div></div></div></header>
    <div className="mx-auto max-w-6xl px-5 py-8 lg:px-8"><p className="mb-5 text-sm text-muted-foreground">제목은 비즈업에서 관리합니다. Notion에서 페이지를 웹에 게시한 뒤 notion.site 주소를 입력하고 항목별 저장 버튼을 눌러 주세요.</p><PublicInstagramMaterials shareId={shareId} initialMaterials={(materialsResult.data ?? []).map(toInstagramMaterial)} /></div>
  </main>;
}
