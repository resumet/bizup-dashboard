import type { ReactNode } from "react";

import { ServiceQuickLinks } from "@/components/layout/service-quick-links";

export default function ServicesLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <ServiceQuickLinks />
      {children}
    </>
  );
}
