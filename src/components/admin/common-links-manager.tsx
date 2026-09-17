"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { commonLinksSchema, type CommonLink } from "@/lib/admin/common-links";

export function CommonLinksManager() {
  const [links, setLinks] = useState<CommonLink[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/common-links", { cache: "no-store", signal: controller.signal }).then(async response => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.message);
      setLinks(body.links); setLoaded(true); setError("");
    }).catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "공통 링크를 불러오지 못했습니다."); });
    return () => controller.abort();
  }, [reload]);
  function change(next: CommonLink[]) { setLinks(next); setNotice(""); setError(""); }
  function move(index: number, offset: number) {
    const next = [...links];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    change(next);
  }
  async function save() {
    const parsed = commonLinksSchema.safeParse(links);
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/common-links", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.data) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message);
      setLinks(body.links); setNotice("저장했습니다. 바로가기 메뉴를 다시 열면 변경된 공통 링크가 표시됩니다.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "저장하지 못했습니다."); }
    finally { setSaving(false); }
  }
  return <Card>
    <CardHeader><CardTitle>바로가기 · 공통 링크</CardTitle><p className="text-sm text-muted-foreground">전체 사용자에게 표시할 링크를 관리합니다. 이름과 주소를 입력하고 순서를 정한 뒤 저장하세요.</p></CardHeader>
    <CardContent className="space-y-4">
      {!loaded && !error && <p role="status" className="text-sm">링크를 불러오는 중입니다.</p>}
      {loaded && <>
        {links.map((link, index) => <div key={index} className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
          <Input aria-label={`${index + 1}번째 링크 이름`} placeholder="링크 이름" maxLength={80} className="w-full sm:w-48" value={link.label} disabled={saving} onChange={event => change(links.map((item, i) => i === index ? { ...item, label: event.target.value } : item))} />
          <Input aria-label={`${index + 1}번째 링크 주소`} placeholder="https://" type="url" maxLength={2048} className="min-w-48 flex-1" value={link.url} disabled={saving} onChange={event => change(links.map((item, i) => i === index ? { ...item, url: event.target.value } : item))} />
          <Button variant="outline" size="icon" aria-label={`${index + 1}번째 링크 위로`} disabled={saving || index === 0} onClick={() => move(index, -1)}><ArrowUp /></Button>
          <Button variant="outline" size="icon" aria-label={`${index + 1}번째 링크 아래로`} disabled={saving || index === links.length - 1} onClick={() => move(index, 1)}><ArrowDown /></Button>
          <Button variant="outline" size="icon" aria-label={`${index + 1}번째 링크 삭제`} disabled={saving} onClick={() => change(links.filter((_, i) => i !== index))}><Trash2 /></Button>
        </div>)}
        {!links.length && <p className="text-sm text-muted-foreground">등록된 공통 링크가 없습니다. 링크를 추가해 주세요.</p>}
        <div className="flex gap-2"><Button variant="outline" disabled={saving || links.length >= 50} onClick={() => change([...links, { label: "", url: "" }])}><Plus />링크 추가</Button><Button disabled={saving} onClick={() => void save()}>{saving ? "저장 중…" : "공통 링크 저장"}</Button></div>
      </>}
      {error && <div role="alert" className="text-sm text-destructive">{error}{!loaded && <Button variant="outline" className="ml-2" onClick={() => { setError(""); setReload(value => value + 1); }}>다시 시도</Button>}</div>}
      {notice && <p role="status" className="text-sm text-emerald-700">{notice}</p>}
    </CardContent>
  </Card>;
}
