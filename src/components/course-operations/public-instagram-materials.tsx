"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink, Loader2, Save } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { isPublicNotionUrl, type InstagramMaterial } from "@/lib/course-operations/instagram-materials";

function openableNotionUrl(value: string) {
  return isPublicNotionUrl(value) ? value : "";
}

async function copyText(value: string) {
  if (!navigator.clipboard?.writeText) throw new Error("이 브라우저에서는 클립보드 복사를 지원하지 않습니다.");
  await navigator.clipboard.writeText(value);
}

export function PublicInstagramMaterials({ shareId, initialMaterials }: { shareId: string; initialMaterials: InstagramMaterial[] }) {
  const [materials, setMaterials] = useState(initialMaterials);
  const [savedUrls, setSavedUrls] = useState(() => new Map(initialMaterials.map((material) => [material.position, material.notionUrl])));
  const [savingPosition, setSavingPosition] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  function updateNotionUrl(position: number, notionUrl: string) {
    setMaterials((current) => current.map((material) => material.position === position ? { ...material, notionUrl } : material));
  }

  async function saveNotionUrl(position: number) {
    const notionUrl = materials.find((material) => material.position === position)?.notionUrl ?? "";
    setSavingPosition(position);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/public/instagram/" + shareId, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ position, notionUrl }),
      });
      const body = await response.json() as { material?: InstagramMaterial; message?: string };
      if (!response.ok || !body.material) throw new Error(body.message ?? "Notion 공개 주소를 저장하지 못했습니다.");
      setMaterials((current) => current.map((material) => material.position === position ? body.material as InstagramMaterial : material));
      setSavedUrls((current) => new Map(current).set(position, body.material?.notionUrl ?? ""));
      setNotice(position + "번 Notion 공개 주소를 저장했습니다.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Notion 공개 주소를 저장하지 못했습니다.");
    } finally {
      setSavingPosition(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">인스타 자료 <span className="text-sm font-normal text-muted-foreground">40개</span></CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
        {notice ? <p className="flex items-center gap-2 text-sm text-emerald-700" role="status"><Check className="size-4" />{notice}</p> : null}
        <Table>
          <TableHeader><TableRow className="hover:bg-transparent"><TableHead className="w-16 text-center">번호</TableHead><TableHead className="min-w-64">제목</TableHead><TableHead className="min-w-[22rem]">Notion 공개 주소</TableHead><TableHead className="w-72 text-right">복사 / 원본 / 공개보기 / 저장</TableHead></TableRow></TableHeader>
          <TableBody>
            {materials.map((material) => {
              const notionUrl = openableNotionUrl(material.notionUrl);
              const isDirty = savedUrls.get(material.position) !== material.notionUrl;
              const embeddedUrl = notionUrl && !isDirty ? `/public/instagram/${shareId}/${material.position}` : "";
              return <TableRow key={material.position}>
                <TableCell className="text-center font-mono text-sm text-muted-foreground">{String(material.position).padStart(2, "0")}</TableCell>
                <TableCell className="font-medium">{material.title || "제목 미입력"}</TableCell>
                <TableCell><div className="space-y-1"><Input type="url" inputMode="url" aria-label={material.position + "번 Notion 공개 주소"} placeholder="https://example.notion.site/..." maxLength={2048} value={material.notionUrl} onChange={(event) => updateNotionUrl(material.position, event.target.value)} />{isDirty ? <p className="text-xs text-amber-700">저장하면 공개 페이지에 반영됩니다.</p> : null}</div></TableCell>
                <TableCell><div className="flex justify-end gap-2">
                  <Button type="button" size="sm" variant="outline" disabled={!material.notionUrl} onClick={() => void copyText(material.notionUrl).then(() => setNotice(material.position + "번 주소를 복사했습니다.")).catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "주소를 복사하지 못했습니다."))}><Copy /> 복사</Button>
                  <Button type="button" size="sm" variant="outline" disabled={!notionUrl} asChild={Boolean(notionUrl)}>{notionUrl ? <a href={notionUrl} target="_blank" rel="noopener noreferrer"><ExternalLink /> 원본</a> : <span><ExternalLink /> 원본</span>}</Button>
                  <Button type="button" size="sm" variant="outline" disabled={!embeddedUrl} asChild={Boolean(embeddedUrl)}>{embeddedUrl ? <a href={embeddedUrl} target="_blank" rel="noopener noreferrer"><ExternalLink /> 공개보기</a> : <span title={isDirty ? "저장 후 확인할 수 있습니다." : undefined}><ExternalLink /> 공개보기</span>}</Button>
                  <Button type="button" size="sm" onClick={() => void saveNotionUrl(material.position)} disabled={savingPosition !== null}>{savingPosition === material.position ? <Loader2 className="animate-spin" /> : <Save />} 저장</Button>
                </div></TableCell>
              </TableRow>;
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
