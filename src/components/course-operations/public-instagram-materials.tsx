"use client";

import { useState } from "react";
import { ExternalLink, Loader2, Save } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { InstagramMaterial } from "@/lib/course-operations/instagram-materials";

function openableUrl(value: string) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

export function PublicInstagramMaterials({ shareId, initialMaterials }: { shareId: string; initialMaterials: InstagramMaterial[] }) {
  const [materials, setMaterials] = useState(initialMaterials);
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
      const response = await fetch(`/api/public/instagram/${shareId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ position, notionUrl }),
      });
      const body = await response.json() as { material?: InstagramMaterial; message?: string };
      if (!response.ok || !body.material) throw new Error(body.message ?? "노션 링크를 저장하지 못했습니다.");
      setMaterials((current) => current.map((material) => material.position === position ? body.material as InstagramMaterial : material));
      setNotice(`${position}번 노션 링크를 저장했습니다.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "노션 링크를 저장하지 못했습니다.");
    } finally {
      setSavingPosition(null);
    }
  }

  return <section className="space-y-4">
    {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
    {notice ? <p className="text-sm text-emerald-700" role="status">{notice}</p> : null}
    <div className="grid gap-3 xl:grid-cols-2">
      {materials.map((material) => {
        const url = openableUrl(material.notionUrl);
        return <article key={material.position} className="rounded-xl border bg-background p-4">
          <p className="text-xs font-medium text-muted-foreground">{material.position}번 자료</p>
          <h2 className="mt-1 min-h-12 text-base font-semibold">{material.title || "제목 미입력"}</h2>
          <label className="mt-4 grid gap-2 text-sm font-medium">강사 노션 링크
            <Input type="url" inputMode="url" placeholder="https://www.notion.so/..." maxLength={2048} value={material.notionUrl} onChange={(event) => updateNotionUrl(material.position, event.target.value)} />
          </label>
          <div className="mt-3 flex justify-end gap-2"><Button type="button" variant="outline" size="sm" disabled={!url} asChild={Boolean(url)}>{url ? <a href={url} target="_blank" rel="noopener noreferrer"><ExternalLink />열기</a> : <span><ExternalLink />열기</span>}</Button><Button type="button" size="sm" onClick={() => void saveNotionUrl(material.position)} disabled={savingPosition !== null}>{savingPosition === material.position ? <Loader2 className="animate-spin" /> : <Save />}저장</Button></div>
        </article>;
      })}
    </div>
  </section>;
}
