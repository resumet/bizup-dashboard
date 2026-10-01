"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, FileText, Loader2, Pencil, Plus } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { CourseDocumentMaterial, CourseDocumentSummary } from "@/lib/course-documents/types";

type Props = {
  accessToken: string;
  initialMaterials: CourseDocumentMaterial[];
  initialDocuments: CourseDocumentSummary[];
};

export function ExternalDocumentList({ accessToken, initialMaterials, initialDocuments }: Props) {
  const router = useRouter();
  const [startingPosition, setStartingPosition] = useState<number | null>(null);
  const [error, setError] = useState("");
  const materials = initialMaterials.filter((material) => material.title.trim());
  const documentsById = new Map(initialDocuments.map((document) => [document.id, document]));

  async function startWriting(position: number) {
    setStartingPosition(position);
    setError("");
    try {
      const response = await fetch(`/api/write/${accessToken}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start-material", position }),
      });
      const body = await response.json() as { id?: string; message?: string };
      if (!response.ok || !body.id) throw new Error(body.message ?? "작성할 문서를 열지 못했습니다.");
      router.push(`/write/${accessToken}/${body.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "작성할 문서를 열지 못했습니다.");
      setStartingPosition(null);
    }
  }

  return (
    <div className="space-y-5">
      {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
      {materials.length ? (
        <div className="grid gap-3">
          {materials.map((material) => {
            const document = material.documentId ? documentsById.get(material.documentId) : undefined;
            const starting = startingPosition === material.position;
            return (
              <Card key={material.position}>
                <CardContent className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted font-mono text-sm text-muted-foreground">
                    {String(material.position).padStart(2, "0")}
                  </span>
                  <div className="w-28 shrink-0">
                    <p className="text-xs text-muted-foreground">기획시트번호</p>
                    <p className="mt-1 font-mono text-sm font-medium">
                      {material.referencePlanningNumber || "-"}
                    </p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold">{material.title}</h2>
                      <Badge variant={document ? (document.status === "published" ? "default" : "secondary") : "outline"}>
                        {document ? (document.status === "published" ? "공개" : "검수 중") : "작성 전"}
                      </Badge>
                    </div>
                    {document ? (
                      <p className="mt-1 text-sm text-muted-foreground">
                        최근 수정 {new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" }).format(new Date(document.updatedAt))}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex gap-2">
                    {document ? (
                      <Button variant="outline" asChild><Link href={`/write/${accessToken}/${document.id}`}><Pencil />수정하기</Link></Button>
                    ) : (
                      <Button disabled={startingPosition !== null} onClick={() => void startWriting(material.position)}>
                        {starting ? <Loader2 className="animate-spin" /> : <Plus />}작성하기
                      </Button>
                    )}
                    {document?.status === "published" ? (
                      <Button variant="outline" asChild><a href={`/article/${document.slug}`} target="_blank" rel="noopener noreferrer"><ExternalLink />미리보기</a></Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card><CardContent className="flex min-h-64 flex-col items-center justify-center text-center text-muted-foreground"><FileText className="mb-3 size-7" /><p>등록된 인스타 자료 제목이 없습니다.</p></CardContent></Card>
      )}
    </div>
  );
}
