import { redirect } from "next/navigation";
import { WbsTemplateManager } from "@/components/course-wbs/wbs-template-manager";
import { getWbsContext } from "@/lib/course-wbs/server";

export default async function WbsTemplatesPage() {
  const context = await getWbsContext();
  if (!context) redirect("/login");
  return <main className="min-h-screen bg-muted/20"><WbsTemplateManager canManage={context.canManageTemplates} /></main>;
}
