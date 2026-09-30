import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { ServiceQuickLinks } from "@/components/layout/service-quick-links";
import { NavigationPerformanceReporter } from "@/components/performance/navigation-performance-reporter";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export default async function ServicesLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);

  if (!user) redirect("/login");

  return (
    <>
      <ServiceQuickLinks email={user.email ?? "이메일 정보 없음"} />
      <NavigationPerformanceReporter />
      {children}
    </>
  );
}
