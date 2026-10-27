import { redirect } from "next/navigation";

export default async function ContentManagementPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  redirect(tab === "youtube" ? "/services/youtube-management" : "/services/instagram-management");
}
