"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type ClipboardEvent, type ReactNode } from "react";
import { ArrowLeft, Copy, ExternalLink, Globe, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { pageBackgrounds, removeBoldMarkers, salesSnapshot, type SalesDraft, type VideoOption } from "@/lib/post-sales/model";
import { giftHeading, invitationHeading, SalesPageView } from "./sales-page";
import { SalesImageEditor } from "./image-editor";

type Props = {
  course: { id: string; name: string; instructor_name: string; payment_link: string };
  videos: VideoOption[]; draft: SalesDraft; revision: number; publicUrl: string; enabled: boolean;
};
function EditorSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className="space-y-4 rounded-xl border bg-card p-5">
    <h2 className="text-lg font-semibold">{title}</h2>{children}
  </section>;
}

function pasteSalesText(event: ClipboardEvent<HTMLFieldSetElement>) {
  const field = event.target;
  if (!(field instanceof HTMLTextAreaElement || (field instanceof HTMLInputElement && field.type === "text")) || field.readOnly) return;
  const pasted = event.clipboardData.getData("text/plain");
  if (!pasted.includes("**")) return;
  event.preventDefault();
  const start = field.selectionStart ?? field.value.length;
  const end = field.selectionEnd ?? start;
  const newlines = field instanceof HTMLTextAreaElement ? "\n" : "";
  const text = removeBoldMarkers(pasted).replace(/\r\n|[\r\n]/g, newlines);
  const available = field.maxLength - (field.value.length - (end - start));
  field.setRangeText(field.maxLength < 0 ? text : text.slice(0, Math.max(0, available)), start, end, "end");
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

export function SalesEditor({ course, videos, ...initial }: Props) {
  const router = useRouter();
  const [draft, setDraft] = useState(initial.draft);
  const [revision, setRevision] = useState(initial.revision);
  const [publicUrl, setPublicUrl] = useState(initial.publicUrl);
  const [enabled, setEnabled] = useState(initial.enabled);
  const [shareOpen, setShareOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const pending = useRef(false);
  const [driveMessage, setDriveMessage] = useState("");
  const api = `/api/course-operations/${course.id}/post-sales`;
  function edit<K extends keyof SalesDraft>(field: K, value: SalesDraft[K]) {
    setDraft(prev => ({ ...prev, [field]: value }));
  }
  async function saveImage(field: "videoImageUrl" | "recapImageUrl" | "concernImageUrl", file?: File) {
    if (pending.current) return false;
    pending.current = true;
    setBusy("image");
    try {
      let url = "";
      if (file) {
        const form = new FormData(); form.set("file", file);
        const upload = await fetch(`${api}/images`, { method: "POST", body: form });
        const result = await upload.json();
        if (!upload.ok) throw new Error(result.message || "이미지를 업로드하지 못했습니다.");
        url = result.url;
      }
      const next = { ...draft, [field]: url };
      const response = await fetch(api, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save", draft: next, revision }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "이미지를 저장하지 못했습니다.");
      setDraft(next); setRevision(result.revision); setPublicUrl(result.publicUrl || "");
      toast(file ? "이미지를 초안에 저장했습니다." : "이미지를 초안에서 삭제했습니다.");
      return true;
    } catch (error) { toast(error instanceof Error ? error.message : "이미지를 저장하지 못했습니다.", { tone: "error" }); return false; }
    finally { pending.current = false; setBusy(""); }
  }
  async function submit(action: "save" | "publish" | "check-drive" | "set-access") {
    if (pending.current) return;
    pending.current = true;
    setBusy(action);
    try {
      const payload = action === "check-drive" ? { action, url: draft.giftUrl }
        : action === "set-access" ? { action, enabled: !enabled, revision } : { action, draft, revision };
      const response = await fetch(api, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "요청을 처리하지 못했습니다.");
      if (action === "check-drive") setDriveMessage(result.message);
      else {
        setRevision(result.revision);
        setPublicUrl(result.publicUrl || "");
        if (action === "set-access") {
          setEnabled(result.enabled);
          toast(result.enabled ? "공개 주소를 활성화했습니다." : "공개 주소를 비활성화했습니다.");
        } else if (action === "publish") {
          setEnabled(true);
          toast("외부에 공개하고 강의에 링크를 저장했습니다.");
          router.refresh();
        } else toast("초안을 저장했습니다.");
      }
    } catch (error) { toast(error instanceof Error ? error.message : "요청을 처리하지 못했습니다.", { tone: "error" }); }
    finally { pending.current = false; setBusy(""); }
  }
  const field = "grid gap-2 text-sm font-medium";
  return <main className="mx-auto max-w-[1700px] space-y-6 px-4 py-7 lg:px-8">
    <Link prefetch={false} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:underline" href={`/services/course-operations/${course.id}`}><ArrowLeft className="size-4" />강의 상세</Link>
    <header className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-semibold">사후 세일즈 페이지 만들기</h1>
      <div className="flex flex-wrap gap-2"><Button disabled={!!busy} variant="outline" onClick={() => submit("save")}>{busy === "save" ? <Loader2 className="animate-spin" /> : <Save />}초안 저장</Button>
        <Dialog open={shareOpen} onOpenChange={open => { if (!pending.current) setShareOpen(open); }}>
          <DialogTrigger asChild><Button disabled={!!busy}><Globe />외부공개</Button></DialogTrigger>
          <DialogContent aria-describedby={undefined} aria-busy={!!busy} className="sm:max-w-md">
            <DialogHeader><DialogTitle>사후 세일즈 페이지 외부공개</DialogTitle></DialogHeader>
            <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <span role="status" className="font-medium">{enabled ? "공개 중" : "비공개"}</span>
              <Button variant="outline" disabled={!!busy} onClick={() => submit(publicUrl ? "set-access" : "publish")}>
                {(busy === "set-access" || (!publicUrl && busy === "publish")) && <Loader2 className="animate-spin" />}
                {enabled ? "공개 비활성화" : "공개 활성화"}
              </Button>
            </div>
            {publicUrl && <>
              <label className="grid gap-2 font-medium">공개 주소<Input readOnly value={publicUrl} onFocus={e => e.target.select()} /></label>
              <div className="flex flex-wrap gap-2">
                {enabled ? <Button variant="outline" asChild><a href={publicUrl} target="_blank" rel="noopener noreferrer"><ExternalLink />새 창에서 열기</a></Button>
                  : <Button variant="outline" disabled><ExternalLink />새 창에서 열기</Button>}
                <Button variant="outline" onClick={async () => {
                  try { await navigator.clipboard.writeText(publicUrl); toast("공개 주소를 복사했습니다."); }
                  catch { toast("주소를 선택해 복사해 주세요.", { tone: "error" }); }
                }}><Copy />주소 복사</Button>
              </div>
              {enabled && <DialogFooter><Button disabled={!!busy} onClick={() => submit("publish")}>
                {busy === "publish" && <Loader2 className="animate-spin" />}수정본 외부공개
              </Button></DialogFooter>}
            </>}
          </DialogContent>
        </Dialog></div>
    </header>
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(22rem,0.85fr)_minmax(0,1.15fr)]">
      <fieldset disabled={!!busy} onPaste={pasteSalesText} className="min-w-0 space-y-6">
        <div className="space-y-4 rounded-xl border bg-card p-5">
          <label className={field}>페이지 제목<Input maxLength={180} value={draft.title} onChange={e => edit("title", e.target.value)} /></label>
          <fieldset className="min-w-0"><legend className="mb-2 text-sm font-medium">페이지 배경색</legend>
            <div className="flex flex-wrap gap-2">{(Object.keys(pageBackgrounds) as SalesDraft["background"][]).map(key =>
              <label key={key} className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1 text-sm has-checked:border-teal-700">
                <input type="radio" name="sales-background" value={key} checked={draft.background === key} onChange={() => edit("background", key)} className="accent-teal-800" />
                <span aria-hidden className="size-4 rounded-full border" style={{ backgroundColor: pageBackgrounds[key].color }} />{pageBackgrounds[key].label}
              </label>)}</div>
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-2">
            {([["titleBackgroundColor", "제목 배경색"], ["buttonColor", "버튼색"]] as const).map(([key, label]) =>
              <label key={key} className={field}>{label}
                <Input type="color" value={draft[key]} onChange={e => edit(key, e.target.value)} className="cursor-pointer p-1" />
              </label>)}
          </div>
          <label className={field}>무료 단톡방 참가 링크<Input type="url" value={draft.chatUrl} onChange={e => edit("chatUrl", e.target.value)} /></label>
        </div>
        <EditorSection title="1. 인사">
          <label className={field}>인사말<Textarea rows={3} maxLength={5000} value={draft.intro} onChange={e => edit("intro", e.target.value)} /></label>
        </EditorSection>
        <EditorSection title="2. 유튜브 채널">
          <label className={field}>강사 유튜브 출연영상<select className="h-10 w-full rounded-md border bg-background px-3" value={draft.videoId} onChange={e => edit("videoId", e.target.value)}>
            <option value="">{videos.length ? "선택 안 함" : "등록된 출연영상 없음"}</option>
            {videos.map(v => <option key={v.id} value={v.id}>{v.label} · {v.url}</option>)}</select></label>
          <SalesImageEditor label="대체 이미지" url={draft.videoImageUrl} busy={!!busy} onSave={file => saveImage("videoImageUrl", file)} onDelete={() => saveImage("videoImageUrl")} />
        </EditorSection>
        <EditorSection title="3. 무료강의 내용 안내">
          <label className={field}>강의 핵심 내용<Textarea rows={5} maxLength={15000} value={draft.recap} onChange={e => edit("recap", e.target.value)} /></label>
          <SalesImageEditor label="이미지" url={draft.recapImageUrl} busy={!!busy} onSave={file => saveImage("recapImageUrl", file)} onDelete={() => saveImage("recapImageUrl")} />
        </EditorSection>
        <EditorSection title="4. 고객 고민">
          {draft.concernQuestions.map((question, index) => <label key={index} className={field}>질문 {index + 1}
            <Input maxLength={500} value={question} onChange={e => edit("concernQuestions",
              draft.concernQuestions.map((value, i) => i === index ? e.target.value : value))} />
          </label>)}
          <label className={field}>질문 다음 상세 설명<Textarea rows={4} maxLength={8000} value={draft.concernExplanation}
            onChange={e => edit("concernExplanation", e.target.value)} /></label>
          <SalesImageEditor label="이미지" url={draft.concernImageUrl} busy={!!busy} onSave={file => saveImage("concernImageUrl", file)} onDelete={() => saveImage("concernImageUrl")} />
        </EditorSection>
        <EditorSection title="5. 무료 강의 선물">
          <label className={field}>{giftHeading}<Textarea rows={4} maxLength={6000} placeholder="선물 내용과 활용 방법을 입력해 주세요." value={draft.gifts} onChange={e => edit("gifts", e.target.value)} /></label>
          <label className={field}>무료 선물 드라이브 링크<Input type="url" value={draft.giftUrl} onChange={e => { edit("giftUrl", e.target.value); setDriveMessage(""); }} /></label>
          <div className="space-y-2"><Button type="button" variant="outline" size="sm" disabled={!draft.giftUrl || !!busy} onClick={() => submit("check-drive")}>{busy === "check-drive" && <Loader2 className="animate-spin" />}공유 권한 검사</Button>
            {driveMessage && <p role="status" className="text-sm">{driveMessage}</p>}</div>
        </EditorSection>
        <EditorSection title="6. 주의">
          <label className={field}>{invitationHeading}<Textarea rows={4} maxLength={8000} placeholder="기억해야 할 내용을 입력해 주세요." value={draft.invitation} onChange={e => edit("invitation", e.target.value)} /></label>
        </EditorSection>
        <EditorSection title="7. 무료강의 다시보기">
          <label className={field}>무료강의 다시보기 링크<Input type="url" value={draft.replayUrl} onChange={e => edit("replayUrl", e.target.value)} /></label>
        </EditorSection>
        <EditorSection title="8. 정규강의 일정 및 커리큘럼">
          <label className={field}>정규과정 결제링크<Input readOnly value={course.payment_link || ""} placeholder="강의 상세에서 결제링크를 저장해 주세요." /></label>
          <a href="https://darkened-stock-6c1.notion.site/39295b2493eb80c08acfdfc44c052c72?pvs=74" target="_blank" rel="noopener noreferrer" className="block text-sm text-primary underline underline-offset-4">분할 결제 방법 (여러개의 카드 혹은 카드와 현금으로 나누어 결제하기)</a>
        </EditorSection>
        <EditorSection title="9. 신용카드 무이자 할부 안내">
          <table className="w-full table-fixed text-left text-sm"><thead><tr><th>카드사</th><th>무이자 (개월)</th><th>할부 (개월)</th></tr></thead>
            <tbody>{draft.cards.map((row, i) => <tr key={row.issuer} className="border-b"><th scope="row">{row.issuer}</th>
              {(["interestFree","installment"] as const).map(key => <td className="py-1 pr-2" key={key}><Input type="number" min={0} max={120} step={1}
                aria-label={`${row.issuer} ${key === "interestFree" ? "무이자" : "할부"} 개월`} value={row[key]} onChange={e => {
                  const months = Number(e.target.value);
                  edit("cards", draft.cards.map((v, index) => index === i ? { ...v, [key]: months } : v));
                }} /></td>)}</tr>)}</tbody></table>
        </EditorSection>
      </fieldset>
      <aside className="min-w-0 space-y-3 xl:sticky xl:top-20 xl:max-h-[calc(100dvh-6rem)] xl:overflow-y-auto">
        <h2 className="text-lg font-semibold">미리보기</h2><SalesPageView page={salesSnapshot(draft, course, videos)} /></aside>
    </div>
  </main>;
}
