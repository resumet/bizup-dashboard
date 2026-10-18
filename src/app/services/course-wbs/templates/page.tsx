import { redirect } from "next/navigation";
import { WbsTemplateManager } from "@/components/course-wbs/wbs-template-manager";
import { isSuperAdminEmail } from "@/lib/admin/access";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export default async function WbsTemplatesPage() {
  const user = await getAuthenticatedUser(await createClient());
  if (!user) redirect("/login");
  return <main className="min-h-screen bg-muted/20"><WbsTemplateManager canManage={isSuperAdminEmail(user.email)} /></main>;
}
