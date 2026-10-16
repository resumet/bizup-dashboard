import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicYoutubeWorkspace } from "@/components/youtube-management/public-workspace";
import { youtubeShareMetadata } from "@/lib/youtube-management/share-metadata";
import { getPublicYoutubeShare, MediaError, publicMedia, resolvePublicYoutubeShortShare } from "@/lib/youtube-management/server";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ code: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  const pagePath = `/y/${encodeURIComponent(code)}`;
  try {
    const { kind, token } = await resolvePublicYoutubeShortShare(code);
    const { course } = await getPublicYoutubeShare(token, kind);
    return youtubeShareMetadata(course, kind, pagePath, `${pagePath}/share-image`);
  } catch {
    return youtubeShareMetadata(null, "schedule", pagePath, "");
  }
}

export default async function ShortYoutubePage({ params }: Props) {
  const { code } = await params;
  const resolved = await resolvePublicYoutubeShortShare(code).catch(error => {
    if (error instanceof MediaError && error.status === 404) notFound();
    throw error;
  });
  const initial = await publicMedia(resolved.token, resolved.kind).catch(error => {
    if (error instanceof MediaError && error.status === 404) notFound();
    throw error;
  });
  return <PublicYoutubeWorkspace kind={resolved.kind} token={resolved.token} initial={initial} />;
}
