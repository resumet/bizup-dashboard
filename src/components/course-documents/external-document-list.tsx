"use client";

import { useState } from "react";
import Link from "next/link";
import { ExternalLink, FilePlus2, Loader2, Pencil, Trash2 } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { COURSE_DOCUMENT_MATERIAL_LIMIT } from "@/lib/course-documents/materials";
import type { CourseDocumentSummary } from "@/lib/course-documents/types";

export function ExternalDocumentList({ accessToken, initialDocuments }: { accessToken: string; initialDocuments: CourseDocumentSummary[] }) {
  const [documents, setDocuments] = useState(initialDocuments);
  const [deletingId, setDeletingId] = useState("");
  const [error, setError] = useState("");
  const atLimit = documents.length >= COURSE_DOCUMENT_MATERIAL_LIMIT;

  async function remove(documentId: string) {
    if (!window.confirm("이 문서를 삭제할까요?")) return;
    setDeletingId(documentId); setError("");
    try {
      const response = await fetch(`/api/write/${accessToken}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documentId }) });
      const body = await response.json() as { message?: string };
      if (!response.ok) throw new Error(body.message ?? "문서를 삭제하지 못했습니다.");
      setDocuments((current) => current.filter((document) => document.id !== documentId));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "문서를 삭제하지 못했습니다."); }
    finally { setDeletingId(""); }
  }

  return <div className="space-y-5">
    <div className="flex items-center justify-between gap-3"><p className="text-sm text-muted-foreground">인스타 글 {documents.length}/{COURSE_DOCUMENT_MATERIAL_LIMIT}</p><Button asChild={!atLimit} disabled={atLimit}>{atLimit ? <><FilePlus2 />최대 40개</> : <Link href={`/write/${accessToken}/new`}><FilePlus2 />새 글</Link>}</Button></div>
    {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
    {documents.length ? <div className="grid gap-3">{documents.map((document) => <Card key={document.id}><CardContent className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h2 className="truncate font-semibold">{document.title}</h2><Badge variant={document.status === "published" ? "default" : "secondary"}>{document.status === "published" ? "공개" : "검수 중"}</Badge></div><p className="mt-1 text-sm text-muted-foreground">최근 수정 {new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" }).format(new Date(document.updatedAt))}</p></div><div className="flex gap-2"><Button variant="outline" asChild><Link href={`/write/${accessToken}/${document.id}`}><Pencil />수정</Link></Button>{document.status === "published" ? <Button variant="outline" asChild><a href={`/article/${document.slug}`} target="_blank" rel="noopener noreferrer"><ExternalLink />미리보기</a></Button> : null}<Button variant="ghost" size="icon" aria-label="문서 삭제" disabled={Boolean(deletingId)} onClick={() => void remove(document.id)}>{deletingId === document.id ? <Loader2 className="animate-spin" /> : <Trash2 />}</Button></div></CardContent></Card>)}</div> : <Card><CardContent className="flex min-h-64 flex-col items-center justify-center text-center"><p className="font-medium">작성한 글이 없습니다</p><Button className="mt-4" asChild><Link href={`/write/${accessToken}/new`}><FilePlus2 />첫 글 만들기</Link></Button></CardContent></Card>}
  </div>;
}
