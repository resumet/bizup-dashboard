import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { BackLink } from "@/components/layout/back-link";
import { Button } from "@/components/ui/button";
import { LinksPage } from "@/components/tools/links-page";
import { isSuperAdminEmail } from "@/lib/admin/access";
import { loadCommonLinks } from "@/lib/admin/common-links-storage";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export default async function LinksCollectionPage(){const user=await getAuthenticatedUser(await createClient());if(!user)redirect("/login");const links=await loadCommonLinks();return <main className="min-h-screen"><header className="border-b bg-background"><div className="mx-auto flex h-18 max-w-5xl items-center px-5 lg:px-8"><Button variant="ghost" size="sm" asChild><BackLink href="/services/tools"><ArrowLeft />유용한 도구들</BackLink></Button><div className="mx-3 h-5 w-px bg-border" /><h1 className="truncate font-semibold">링크 모음</h1></div></header><div className="mx-auto max-w-5xl px-5 py-8 lg:px-8"><LinksPage initialLinks={links} canManage={isSuperAdminEmail(user.email)} /></div></main>;}
