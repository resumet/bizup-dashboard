"use client";

import type { ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function MediaManagementTabs({ summary, instagram, youtube, initialTab }: {
  summary?: ReactNode;
  instagram: ReactNode;
  youtube: ReactNode;
  initialTab?: string;
}) {
  const defaultTab = summary ? "summary" : "instagram";
  const selectedTab = initialTab === "youtube"
    ? "youtube"
    : initialTab === "instagram"
      ? "instagram"
      : initialTab === "summary" && summary
        ? "summary"
        : defaultTab;

  return <Tabs defaultValue={selectedTab}>
    <TabsList aria-label="강사 인스타그램 / 유튜브 관리" className="mb-5">
      {summary ? <TabsTrigger value="summary" className="px-4">요약</TabsTrigger> : null}
      <TabsTrigger value="instagram" className="px-4">인스타그램 관리</TabsTrigger>
      <TabsTrigger value="youtube" className="px-4">유튜브 출연 관리</TabsTrigger>
    </TabsList>
    {summary ? <TabsContent value="summary">{summary}</TabsContent> : null}
    <TabsContent value="instagram">{instagram}</TabsContent>
    <TabsContent value="youtube">{youtube}</TabsContent>
  </Tabs>;
}
