"use client";

import { useEffect, useState } from "react";
import { FileDown, Loader2 } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CourseDocumentLead } from "@/lib/course-documents/types";

type LoadResponse = { leads?: CourseDocumentLead[]; message?: string };

function dateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

export function InstagramLeadsWorkspace() {
  const [leads, setLeads] = useState<CourseDocumentLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/instagram-management", { cache: "no-store" })
      .then(async (response) => ({ response, body: await response.json() as LoadResponse }))
      .then(({ response, body }) => {
        if (!active) return;
        if (!response.ok || !body.leads) throw new Error(body.message ?? "리드를 불러오지 못했습니다.");
        setLeads(body.leads);
      })
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof Error ? caught.message : "리드를 불러오지 못했습니다.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  if (loading) return <div className="flex min-h-80 items-center justify-center gap-2 rounded-xl border border-dashed text-muted-foreground"><Loader2 className="animate-spin" />불러오는 중</div>;

  return <div className="space-y-4">
    {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
    <div className="flex justify-end"><Button asChild><a href="/api/instagram-management/leads/export"><FileDown />Excel 다운로드</a></Button></div>
    <Card><CardContent className="pt-6"><Table><TableHeader><TableRow><TableHead>등록일</TableHead><TableHead>이름</TableHead><TableHead>전화번호</TableHead><TableHead>강사</TableHead><TableHead>강의</TableHead><TableHead>문서</TableHead><TableHead>유입</TableHead></TableRow></TableHeader><TableBody>{leads.map((lead) => <TableRow key={lead.id}><TableCell className="whitespace-nowrap">{dateTime(lead.createdAt)}</TableCell><TableCell>{lead.name}</TableCell><TableCell className="font-mono">{lead.phone}</TableCell><TableCell>{lead.instructorName}</TableCell><TableCell>{lead.courseName}</TableCell><TableCell>{lead.documentTitle}</TableCell><TableCell>{lead.utmSource || lead.referrer || "-"}</TableCell></TableRow>)}</TableBody></Table>{!leads.length ? <div className="flex min-h-44 items-center justify-center text-sm text-muted-foreground">등록된 리드가 없습니다.</div> : null}</CardContent></Card>
  </div>;
}
