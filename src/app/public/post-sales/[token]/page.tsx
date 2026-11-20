import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { SalesPageView } from "@/components/post-sales/sales-page";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SalesPage } from "@/lib/post-sales/model";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ token: string }> };
const publicPage = cache(async (token: string): Promise<SalesPage> => {
  if (!z.uuid().safeParse(token).success) notFound();
  const { data, error } = await createAdminClient().from("course_post_sales_pages")
    .select("published").eq("token", token).not("published", "is", null).maybeSingle();
  if (error) throw new Error("공개 페이지를 불러오지 못했습니다.");
  if (!data?.published) notFound();
  return data.published as SalesPage;
});
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = await publicPage((await params).token);
  return { title: page.title, description: page.intro.slice(0, 150) || page.courseName, robots: { index: false, follow: false } };
}
export default async function PublicSalesPage({ params }: Props) {
  return <main className="min-h-screen bg-stone-50 px-3 py-5 sm:px-6 sm:py-12"><SalesPageView page={await publicPage((await params).token)} /></main>;
}
