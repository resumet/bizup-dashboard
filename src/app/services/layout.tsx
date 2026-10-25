import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { NavigationPerformanceReporter } from "@/components/performance/navigation-performance-reporter";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export default async function ServicesLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);

  if (!user) redirect("/login");

  return (
    <>
      <NavigationPerformanceReporter />
      {children}
    </>
  );
}
