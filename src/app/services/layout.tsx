import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { ServiceQuickLinks } from "@/components/layout/service-quick-links";
import { NavigationPerformanceReporter } from "@/components/performance/navigation-performance-reporter";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_WORK_SERVICE_CARD_SETTINGS } from "@/lib/work/service-card-settings";
import { loadWorkServiceCardSettings } from "@/lib/work/service-card-settings-storage";

export default async function ServicesLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);

  if (!user) redirect("/login");

  const cardSettings = await loadWorkServiceCardSettings().catch(
    () => DEFAULT_WORK_SERVICE_CARD_SETTINGS,
  );

  return (
    <>
      <ServiceQuickLinks
        email={user.email ?? "이메일 정보 없음"}
        hiddenRoutes={cardSettings.hiddenRoutes}
      />
      <NavigationPerformanceReporter />
      {children}
    </>
  );
}
