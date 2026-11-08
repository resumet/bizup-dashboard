import { notFound, redirect } from "next/navigation";
import { MetaAdsManager } from "@/components/admin/meta-ads-manager";
import { isSuperAdminEmail } from "@/lib/admin/access";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
export default async function Page(){const user=await getAuthenticatedUser(await createClient());if(!user)redirect("/login");if(!isSuperAdminEmail(user.email))notFound();return <MetaAdsManager/>}
