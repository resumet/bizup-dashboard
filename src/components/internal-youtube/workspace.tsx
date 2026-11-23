"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { isSelectableCourse } from "@/lib/course-operations/course-status";
import type { InternalAppearance, InternalChannel, InternalYoutubeData } from "@/lib/internal-youtube/model";

const fields = [
  ["filming_date", "촬영일", "date"], ["location", "장소", "text"],
  ["original_drive_url", "촬영원본 드라이브", "url"], ["edited_drive_url", "촬영된 수정본 드라이브", "url"],
  ["upload_date", "업로드 일정", "date"], ["published_url", "업로드된 채널 주소", "url"],
] as const;
type Editor = { kind: "channel" | "appearance"; id?: string; revision?: number; remove?: boolean; values: Record<string, string> };
function ExternalLink({ url, label }: { url: string; label: string }) {
  return url ? <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-4">{label}</a> : <span className="text-muted-foreground">—</span>;
}

export function InternalYoutubeWorkspace({ data, courseId }: { data: InternalYoutubeData; courseId: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<"appearances" | "channels">("appearances");
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [saving, setSaving] = useState(false);
  const channels = new Map(data.channels.map(channel => [channel.id, channel]));
  const shownCourses = data.courses.filter(course => (!courseId || course.id === courseId) && `${course.name} ${course.instructor_name}`.toLowerCase().includes(search.toLowerCase()));
  const courseOptions = data.courses.filter(course => isSelectableCourse(course) || course.id === data.appearances.find(row => row.id === editor?.id)?.course_id);

  function editChannel(row?: InternalChannel, remove = false) {
    setEditor({ kind: "channel", id: row?.id, revision: row?.revision, remove, values: { name: row?.name ?? "", manager_name: row?.manager_name ?? "", channel_url: row?.channel_url ?? "" } });
  }
  function editAppearance(selectedCourse: string, row?: InternalAppearance, remove = false) {
    setEditor({ kind: "appearance", id: row?.id, revision: row?.revision, remove, values: {
      course_id: row?.course_id ?? selectedCourse, channel_id: row?.channel_id ?? "",
      ...Object.fromEntries(fields.map(([key]) => [key, row?.[key] ?? ""])),
    } });
  }
  function change(key: string, value: string) { setEditor(current => current ? { ...current, values: { ...current.values, [key]: value } } : null); }
  async function save() {
    if (!editor || saving) return;
    setSaving(true);
    try {
      const response = await fetch("/api/internal-youtube", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: editor.kind, action: editor.remove ? "delete" : "save", id: editor.id, revision: editor.revision, data: editor.values }) });
      const result = await response.json();
      if (!response.ok || !result.saved) throw new Error(result.message || "저장하지 못했습니다.");
      toast(editor.remove ? "삭제했습니다." : "저장했습니다.");
      setEditor(null);
      router.refresh();
    } catch (error) { toast(error instanceof Error ? error.message : "요청을 처리하지 못했습니다.", { tone: "error" }); }
    finally { setSaving(false); }
  }
  return <main className="mx-auto max-w-[1600px] space-y-6 px-5 py-8">
    <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-semibold">자체 유튜브 관리</h1><Button asChild variant="outline"><Link href="/services/course-operations">강의 목록</Link></Button></div>
    <div className="flex flex-wrap gap-2" aria-label="관리 화면 선택">
      <Button variant={tab === "appearances" ? "default" : "outline"} aria-pressed={tab === "appearances"} onClick={() => setTab("appearances")}>강의별 출연 관리</Button>
      <Button variant={tab === "channels" ? "default" : "outline"} aria-pressed={tab === "channels"} onClick={() => setTab("channels")}>자체 채널 관리</Button>
    </div>
    {tab === "channels" ? <section className="space-y-4">
      <div className="flex justify-end"><Button onClick={() => editChannel()}>채널 등록</Button></div>
      <div className="overflow-x-auto rounded-lg border"><table className="w-full text-left text-sm"><thead className="bg-muted"><tr>{["채널 이름", "채널 관리자 이름", "채널 주소", "편집"].map(label => <th key={label} className="p-3">{label}</th>)}</tr></thead><tbody>
        {data.channels.map(channel => <tr key={channel.id} className="border-t"><td className="p-3 font-medium">{channel.name}</td><td className="p-3">{channel.manager_name || "—"}</td><td className="p-3"><ExternalLink url={channel.channel_url} label="채널 열기" /></td><td className="space-x-2 whitespace-nowrap p-3"><Button size="sm" variant="outline" onClick={() => editChannel(channel)}>수정</Button><Button size="sm" variant="outline" onClick={() => editChannel(channel, true)}>삭제</Button></td></tr>)}
        {!data.channels.length && <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">출연 정보를 등록하려면 먼저 자체 채널을 등록해 주세요.</td></tr>}
      </tbody></table></div>
    </section> : <section className="space-y-4">
      <div className="flex gap-3"><Input className="max-w-sm" aria-label="강의 또는 강사 검색" placeholder="강의 또는 강사 검색" value={search} onChange={event => setSearch(event.target.value)} />{courseId && <Button variant="outline" asChild><Link href="/services/internal-youtube">전체 강의</Link></Button>}</div>
      {!shownCourses.length && <p className="p-8 text-center text-muted-foreground">표시할 강의가 없습니다.</p>}
      {shownCourses.map(course => {
        const appearances = data.appearances.filter(row => row.course_id === course.id);
        return <details key={course.id} open={Boolean(courseId) || isSelectableCourse(course)} className="rounded-lg border bg-background">
          <summary className="cursor-pointer p-4 font-semibold">{course.instructor_name} · {course.name} <span className="ml-2 text-sm font-normal text-muted-foreground">{appearances.length}건</span></summary>
          <div className="space-y-3 border-t p-4">
            {isSelectableCourse(course) && <div className="flex justify-end"><Button variant="outline" disabled={!data.channels.length} onClick={() => editAppearance(course.id)}>출연 추가</Button></div>}
            {!data.channels.length && <Button variant="link" onClick={() => setTab("channels")}>자체 채널을 먼저 등록해 주세요.</Button>}
            {appearances.length ? <div className="overflow-x-auto"><table className="w-full min-w-[1000px] text-left text-sm"><thead className="bg-muted"><tr><th className="p-3">채널 이름</th>{fields.map(([key, label]) => <th key={key} className="p-3">{label}</th>)}<th className="p-3">편집</th></tr></thead><tbody>{appearances.map(row => <tr key={row.id} className="border-t"><td className="p-3 font-medium">{channels.get(row.channel_id)?.name ?? "채널 없음"}</td>{fields.map(([key, label, type]) => <td key={key} className="p-3">{type === "url" ? <ExternalLink url={row[key] ?? ""} label={`${label} 열기`} /> : row[key] || "—"}</td>)}<td className="space-x-2 whitespace-nowrap p-3"><Button size="sm" variant="outline" onClick={() => editAppearance(course.id, row)}>수정</Button><Button size="sm" variant="outline" onClick={() => editAppearance(course.id, row, true)}>삭제</Button></td></tr>)}</tbody></table></div> : <p className="py-4 text-sm text-muted-foreground">등록된 출연 정보가 없습니다.</p>}
          </div>
        </details>;
      })}
    </section>}
    <Dialog open={!!editor} onOpenChange={open => { if (!open && !saving) setEditor(null); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl" aria-describedby={undefined}>
        <DialogHeader><DialogTitle>{editor?.kind === "channel" ? "자체 채널" : "강의 출연"} {editor?.remove ? "삭제" : editor?.id ? "수정" : "등록"}</DialogTitle></DialogHeader>
        {editor && <form onSubmit={event => { event.preventDefault(); void save(); }} className="space-y-4">
          {editor.remove ? <p className="text-sm">{editor.kind === "channel" ? `‘${editor.values.name}’ 채널` : "선택한 출연 기록"}을 삭제할까요? 삭제한 정보는 복구할 수 없습니다.</p> : editor.kind === "channel" ? <>
            {[["name", "채널 이름", "text"], ["manager_name", "채널 관리자 이름", "text"], ["channel_url", "채널 주소", "url"]].map(([key, label, type]) => <label key={key} className="block space-y-2 text-sm"><span>{label}</span><Input required={key === "name"} type={type} value={editor.values[key]} disabled={saving} onChange={event => change(key, event.target.value)} /></label>)}
          </> : <>
            <label className="block space-y-2 text-sm"><span>강의</span><select required className="h-10 w-full rounded-md border bg-background px-3" disabled={saving} value={editor.values.course_id} onChange={event => change("course_id", event.target.value)}><option value="">강의 선택</option>{courseOptions.map(course => <option key={course.id} value={course.id}>{course.instructor_name} · {course.name}</option>)}</select></label>
            <label className="block space-y-2 text-sm"><span>자체 유튜브 채널</span><select required className="h-10 w-full rounded-md border bg-background px-3" disabled={saving} value={editor.values.channel_id} onChange={event => change("channel_id", event.target.value)}><option value="">채널 선택</option>{data.channels.map(channel => <option key={channel.id} value={channel.id}>{channel.name}</option>)}</select></label>
            {fields.map(([key, label, type]) => <label key={key} className="block space-y-2 text-sm"><span>{label}</span><Input type={type} value={editor.values[key]} disabled={saving} onChange={event => change(key, event.target.value)} /></label>)}
          </>}
          <DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={() => setEditor(null)}>취소</Button><Button type="submit" variant={editor.remove ? "destructive" : "default"} disabled={saving}>{saving ? "처리 중…" : editor.remove ? "삭제" : "저장하기"}</Button></DialogFooter>
        </form>}
      </DialogContent>
    </Dialog>
  </main>;
}
