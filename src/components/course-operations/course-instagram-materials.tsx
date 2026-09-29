"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, ExternalLink, Globe2, Loader2, Save } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { InstagramMaterial, InstagramShare } from "@/lib/course-operations/instagram-materials";

type InstagramResponse = { materials?: InstagramMaterial[]; share?: InstagramShare; material?: InstagramMaterial; message?: string };

function openableUrl(value: string) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

async function copyText(value: string) {
  if (!navigator.clipboard?.writeText) throw new Error("이 브라우저에서는 클립보드 복사를 지원하지 않습니다.");
  await navigator.clipboard.writeText(value);
}

export function CourseInstagramMaterials({ courseId }: { courseId: string }) {
  const [materials, setMaterials] = useState<InstagramMaterial[]>([]);
  const [share, setShare] = useState<InstagramShare | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingPosition, setSavingPosition] = useState<number | null>(null);
  const [changingVisibility, setChangingVisibility] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const publicUrl = useMemo(() => share && typeof window !== "undefined" ? window.location.origin + "/public/instagram/" + share.publicId : "", [share]);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/course-operations/" + courseId + "/instagram", { cache: "no-store" });
        const body = await response.json() as InstagramResponse;
        if (!response.ok || !body.materials || !body.share) throw new Error(body.message ?? "인스타 자료를 불러오지 못했습니다.");
        if (active) { setMaterials(body.materials); setShare(body.share); }
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "인스타 자료를 불러오지 못했습니다.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [courseId]);

  function updateTitle(position: number, title: string) {
    setMaterials((current) => current.map((material) => material.position === position ? { ...material, title } : material));
  }

  async function saveTitle(position: number) {
    const title = materials.find((material) => material.position === position)?.title ?? "";
    setSavingPosition(position);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/course-operations/" + courseId + "/instagram", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "title", position, title }),
      });
      const body = await response.json() as InstagramResponse;
      if (!response.ok || !body.material) throw new Error(body.message ?? "제목을 저장하지 못했습니다.");
      setMaterials((current) => current.map((material) => material.position === position ? body.material as InstagramMaterial : material));
      setNotice(position + "번 제목을 저장했습니다.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "제목을 저장하지 못했습니다.");
    } finally {
      setSavingPosition(null);
    }
  }

  async function setVisibility(isPublic: boolean) {
    setChangingVisibility(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/course-operations/" + courseId + "/instagram", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "visibility", isPublic }),
      });
      const body = await response.json() as InstagramResponse;
      if (!response.ok || !body.share) throw new Error(body.message ?? "공개 설정을 저장하지 못했습니다.");
      setShare(body.share);
      setNotice(isPublic ? "외부 공개 페이지를 켰습니다." : "외부 공개 페이지를 껐습니다.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "공개 설정을 저장하지 못했습니다.");
    } finally {
      setChangingVisibility(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2 text-base"><Globe2 className="size-5" /> 인스타 자료 <span className="text-sm font-normal text-muted-foreground">40개</span></CardTitle>
        <Dialog>
          <DialogTrigger asChild><Button type="button" variant="outline" size="sm" disabled={loading || !share}><Globe2 /> 공개 설정</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>인스타 외부 공개 페이지</DialogTitle><DialogDescription>공개하면 강사가 링크를 열어 각 항목의 노션 링크를 입력할 수 있습니다.</DialogDescription></DialogHeader>
            <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
              <div className="flex items-center justify-between gap-3"><span className="font-medium">공개 상태</span><Badge variant={share?.isPublic ? "default" : "secondary"}>{share?.isPublic ? "공개" : "비공개"}</Badge></div>
              <Input aria-label="강사 공개 페이지 주소" readOnly value={publicUrl} />
            </div>
            <DialogFooter className="sm:justify-between">
              <Button type="button" variant="outline" disabled={!publicUrl} onClick={() => void copyText(publicUrl).then(() => setNotice("공개 페이지 주소를 복사했습니다.")).catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "주소를 복사하지 못했습니다."))}><Copy /> 주소 복사</Button>
              <Button type="button" variant={share?.isPublic ? "outline" : "default"} disabled={changingVisibility || !share} onClick={() => void setVisibility(!share?.isPublic)}>{changingVisibility ? <Loader2 className="animate-spin" /> : <Globe2 />}{share?.isPublic ? " 비공개로 전환" : " 공개하기"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
        {notice ? <p className="flex items-center gap-2 text-sm text-emerald-700" role="status"><Check className="size-4" />{notice}</p> : null}
        {loading ? <div className="flex min-h-48 items-center justify-center gap-2 rounded-lg border border-dashed text-sm text-muted-foreground"><Loader2 className="animate-spin" /> 자료를 불러오는 중입니다.</div> : (
          <Table>
            <TableHeader><TableRow className="hover:bg-transparent"><TableHead className="w-16 text-center">번호</TableHead><TableHead className="min-w-64">제목</TableHead><TableHead className="min-w-[22rem]">링크</TableHead><TableHead className="w-36 text-right">복사 / 열기</TableHead></TableRow></TableHeader>
            <TableBody>
              {materials.map((material) => {
                const notionUrl = openableUrl(material.notionUrl);
                return <TableRow key={material.position}>
                  <TableCell className="text-center font-mono text-sm text-muted-foreground">{String(material.position).padStart(2, "0")}</TableCell>
                  <TableCell><div className="flex min-w-60 items-center gap-2"><Input aria-label={material.position + "번 자료 제목"} placeholder="자료 제목" maxLength={200} value={material.title} onChange={(event) => updateTitle(material.position, event.target.value)} /><Button type="button" size="sm" className="shrink-0" onClick={() => void saveTitle(material.position)} disabled={savingPosition !== null}>{savingPosition === material.position ? <Loader2 className="animate-spin" /> : <Save />} 저장</Button></div></TableCell>
                  <TableCell><Input className="min-w-80 truncate" aria-label={material.position + "번 강사 노션 링크"} readOnly value={material.notionUrl} placeholder="강사가 입력한 노션 링크" /></TableCell>
                  <TableCell><div className="flex justify-end gap-2"><Button type="button" size="sm" variant="outline" disabled={!material.notionUrl} onClick={() => void copyText(material.notionUrl).then(() => setNotice(material.position + "번 링크를 복사했습니다.")).catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "링크를 복사하지 못했습니다."))}><Copy /> 복사</Button><Button type="button" size="sm" variant="outline" disabled={!notionUrl} asChild={Boolean(notionUrl)}>{notionUrl ? <a href={notionUrl} target="_blank" rel="noopener noreferrer"><ExternalLink /> 열기</a> : <span><ExternalLink /> 열기</span>}</Button></div></TableCell>
                </TableRow>;
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
