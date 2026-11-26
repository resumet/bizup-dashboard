"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { issueCourseShortLink } from "@/lib/short-links/browser";
import type { ReplayGuide, GuideState } from "@/lib/replay-guide/model";
import { GuideView } from "./guide";

type Section = ReplayGuide["sections"][number];
export function GuideEditor(initial: { courseId: string; draft: ReplayGuide; state: GuideState }) {
  const router = useRouter();
  const [draft, setDraft] = useState(initial.draft);
  const [state, setState] = useState(initial.state);
  const [busy, setBusy] = useState(false);
  const api = `/api/course-operations/${initial.courseId}/replay-guide`;
  const href = state.shortUrl || state.path;

  function change(id: string, patch: Partial<Section>) {
    setDraft(prev => ({ ...prev, sections: prev.sections.map(s => s.id === id ? { ...s, ...patch } : s) }));
  }
  async function run(work: () => Promise<void>) {
    setBusy(true);
    try { await work(); }
    catch (error) { toast(error instanceof Error ? error.message : "요청을 처리하지 못했습니다.", { tone: "error" }); }
    finally { setBusy(false); }
  }
  async function save(action: "save" | "publish" | "access") {
    await run(async () => {
      const body = action === "access" ? { enabled: !state.enabled } : { draft };
      const response = await fetch(api, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, revision: state.revision, ...body }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "안내문을 저장하지 못했습니다.");
      setState(result);
      toast(action === "save" ? "초안을 저장했습니다." : result.enabled ? "안내문을 공개했습니다." : "공개를 중지했습니다.");
      router.refresh();
    });
  }
  async function upload(id: string, file: File) {
    await run(async () => {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024) {
        throw new Error("10MB 이하의 JPG, PNG, WebP 이미지를 선택해 주세요.");
      }
      const form = new FormData();
      form.set("file", file);
      const response = await fetch(`${api}/images`, { method: "POST", body: form });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.url) throw new Error(result?.message || "이미지를 업로드하지 못했습니다. 파일 크기를 확인해 주세요.");
      setDraft(prev => ({ ...prev, sections: prev.sections.map(s => s.id === id ? { ...s, images: [...s.images, result.url] } : s) }));
      toast("이미지를 추가했습니다. 안내문을 저장해 주세요.");
    });
  }
  return <main className="mx-auto max-w-[1500px] space-y-6 p-4 sm:p-8">
    <Link href={`/services/course-operations/${initial.courseId}`} className="text-sm underline">강의 상세로 돌아가기</Link>
    <header className="flex flex-wrap items-center justify-between gap-4">
      <h1 className="text-2xl font-bold">다시보기 안내문 편집</h1>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={busy} onClick={() => save("save")}>초안 저장</Button>
        <Button disabled={busy} onClick={() => save("publish")}>{state.path ? "편집 내용 공개" : "외부 공개"}</Button>
      </div>
    </header>
    {state.path && <section className="flex flex-wrap items-center gap-3 rounded-lg border p-4">
      <strong>{state.enabled ? "공개 중" : "공개 중지"}</strong>
      <span className="min-w-0 break-all text-sm">{href}</span>
      {state.enabled && <Button asChild variant="outline"><a href={href} target="_blank" rel="noopener noreferrer">새 창에서 열기</a></Button>}
      <Button variant="outline" disabled={busy} onClick={() => run(async () => {
        await navigator.clipboard.writeText(new URL(href, window.location.origin).href); toast("링크를 복사했습니다.");
      })}>주소 복사</Button>
      <Button variant="outline" disabled={busy} onClick={() => save("access")}>{state.enabled ? "공개 중지" : "다시 활성화"}</Button>
      {!state.shortUrl && <Button variant="outline" disabled={busy || !state.enabled} onClick={() => run(async () => {
        const link = await issueCourseShortLink({ course_id: initial.courseId, purpose: "replay-guide" });
        setState(prev => ({ ...prev, shortUrl: link.short_url })); toast("단축링크를 저장했습니다.");
        router.refresh();
      })}>단축링크 발급</Button>}
    </section>}
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <fieldset disabled={busy} className="min-w-0 space-y-4">
        <label className="grid gap-2 text-sm font-medium">안내문 제목<Input value={draft.title} maxLength={200} onChange={e => setDraft({ ...draft, title: e.target.value })} /></label>
        {draft.sections.map((section, i) => <div key={section.id} className="space-y-3 rounded-lg border p-4">
          <label className="grid gap-1 text-sm font-medium">{i + 1}. 섹션 제목<Input value={section.heading} maxLength={200} onChange={e => change(section.id, { heading: e.target.value })} /></label>
          <label className="grid gap-1 text-sm">안내 내용<Textarea value={section.body} rows={4} maxLength={8000} onChange={e => change(section.id, { body: e.target.value })} /></label>
          <label className="grid gap-1 text-sm">참고·주의사항<Textarea value={section.note} maxLength={3000} onChange={e => change(section.id, { note: e.target.value })} /></label>
          <label className="grid gap-1 text-sm">안내 링크<Input type="url" value={section.link} maxLength={2048} onChange={e => change(section.id, { link: e.target.value })} /></label>
          {section.images.map((image, j) => <div key={image} className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="h-16 w-24 rounded border object-contain" src={image} alt={`${section.heading} 화면 ${j + 1}`} />
            <Button variant="ghost" onClick={() => change(section.id, { images: section.images.filter(url => url !== image) })}>이미지 제거</Button>
          </div>)}
          {section.images.length < 8 && <label className="grid gap-1 text-sm">화면 이미지 추가<Input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => {
            const file = e.target.files?.[0]; e.target.value = ""; if (file) void upload(section.id, file);
          }} /></label>}
          <Button variant="outline" disabled={draft.sections.length === 1} onClick={() => setDraft({ ...draft, sections: draft.sections.filter(s => s.id !== section.id) })}>섹션 제거</Button>
        </div>)}
        <Button variant="outline" disabled={draft.sections.length >= 20} onClick={() => setDraft({ ...draft, sections: [...draft.sections,
          { id: crypto.randomUUID(), heading: "", body: "", note: "", link: "", images: [] }] })}>섹션 추가</Button>
      </fieldset>
      <section className="min-w-0 space-y-3 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:overflow-auto">
        <h2 className="font-semibold">미리보기</h2><GuideView draft={draft} />
      </section>
    </div>
  </main>;
}
