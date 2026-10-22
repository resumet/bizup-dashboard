import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ExternalMarketingIntakeForm } from "@/components/external-marketing/external-intake-form";
import { loadExternalMarketingIntake } from "@/lib/external-marketing/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "외부마케팅대행 정보 입력", robots: { index: false, follow: false } };

export default async function ExternalMarketingIntakePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const project = await loadExternalMarketingIntake(token);
  if (!project) notFound();
  return <ExternalMarketingIntakeForm token={token} initialValue={project} />;
}
