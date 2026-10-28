"use client";

import type { ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function MediaManagementTabs({ instagram, youtube, initialTab }: {
  instagram: ReactNode;
  youtube: ReactNode;
  initialTab?: string;
}) {
  const selectedTab = initialTab === "youtube"
    ? "youtube"
    : "instagram";

  return <Tabs defaultValue={selectedTab}>
    <TabsList aria-label="강사 인스타그램 / 유튜브 관리" className="mb-5">
      <TabsTrigger value="instagram" className="px-4">인스타그램 관리</TabsTrigger>
      <TabsTrigger value="youtube" className="px-4">강사 출연 유튜브 관리</TabsTrigger>
    </TabsList>
    <TabsContent value="instagram">{instagram}</TabsContent>
    <TabsContent value="youtube">{youtube}</TabsContent>
  </Tabs>;
}
