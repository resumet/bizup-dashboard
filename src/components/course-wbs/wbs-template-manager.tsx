"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, LoaderCircle, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { applyTemplateToCourse, WEBINAR_ITEM_ID } from "@/lib/course-wbs/webinar-date";
import { WBS_START_OFFSETS, WBS_DUE_OFFSETS, datesForStartOffset, dueDateForOffset } from "@/lib/course-wbs/schedule-options";
import { reusableItems } from "@/lib/course-wbs/template-items";
import { parseWbsTemplateBody } from "@/lib/course-wbs/validation";
import { WBS_INTERNAL_PAGES } from "@/lib/course-wbs/task-links";
import type { CourseWbsBootstrap, WbsItem, WbsTemplate } from "@/lib/course-wbs/types";

const selectClass = "h-9 w-full rounded-lg border border-input bg-background px-2 text-sm disabled:opacity-60";

export function WbsTemplateManager({ canManage }: { canManage: boolean }) {
  const [template, setTemplate] = useState<WbsTemplate | null>(null);
  const [items, setItems] = useState<WbsItem[]>([]);
  const [name, setName] = useState("");
  const [referenceDate, setReferenceDate] = useState("2000-06-15");
  const [people, setPeople] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [conflict, setConflict] = useState(false);
  const disabled = !canManage || saving;

  function accept(body: CourseWbsBootstrap) {
    const anchor = body.template.items.find((item) => item.id === WEBINAR_ITEM_ID);
    const date = anchor?.dueDate || anchor?.startDate || "2000-06-15";
    setTemplate(body.template); setName(body.template.name);
    setReferenceDate(date); setItems(applyTemplateToCourse(body.template.items, date));
    setPeople([...new Set([...body.people, ...body.employeeNames])]); setDirty(false); setConflict(false);
  }

  useEffect(() => {
    let active = true;
    fetch("/api/course-wbs", { cache: "no-store" }).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "템플릿을 불러오지 못했습니다.");
      if (active) accept(body);
    }).catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : "템플릿을 불러오지 못했습니다."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function edit(id: string, patch: Partial<WbsItem>) {
    if (disabled) return;
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
    setDirty(true); setNotice("");
  }

  function move(index: number, direction: number) {
    if (disabled) return;
    const next = [...items];
    [next[index], next[index + direction]] = [next[index + direction], next[index]];
    setItems(next.map((item, position) => ({ ...item, position }))); setDirty(true);
  }

  async function reload() {
    if (dirty && !window.confirm("편집 내용을 버리고 최신 템플릿을 불러올까요?")) return;
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/course-wbs", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "템플릿을 불러오지 못했습니다.");
      accept(body);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "템플릿을 불러오지 못했습니다."); }
    finally { setLoading(false); }
  }

  async function save() {
    if (disabled || !template) return;
    setError(""); setNotice("");
    let input;
    try { input = parseWbsTemplateBody({ name, items: reusableItems(items) }); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "입력 내용을 확인해 주세요."); return; }
    setSaving(true);
    try {
      const response = await fetch(`/api/course-wbs/templates/${encodeURIComponent(template.id)}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...input, expectedUpdatedAt: template.updatedAt }),
      });
      const body = await response.json();
      if (!response.ok) { setConflict(response.status === 409); throw new Error(body.message || "템플릿을 저장하지 못했습니다."); }
      setTemplate(body.template); setItems(body.template.items); setName(body.template.name); setDirty(false); setConflict(false);
      setNotice("템플릿을 저장했습니다. 새로 불러오는 WBS에 적용됩니다. 기존 업무에 연결이 없으면 같은 템플릿 항목의 연결 화면을 표시합니다.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "템플릿을 저장하지 못했습니다."); }
    finally { setSaving(false); }
  }

  return <>
    <header className="border-b bg-background"><div className="mx-auto flex max-w-[1900px] flex-wrap items-center gap-4 px-5 py-4 lg:px-8">
      <Button variant="ghost" size="sm" asChild><Link href="/services/course-wbs" onClick={(event) => { if (dirty && !window.confirm("저장하지 않은 변경 사항이 있습니다. WBS 목록으로 이동할까요?")) event.preventDefault(); }}>WBS 목록</Link></Button><h1 className="text-base font-semibold">WBS 템플릿 관리</h1>
    </div></header>
    <div className="mx-auto max-w-[1900px] space-y-5 px-5 py-8 lg:px-8">
      {error ? <Alert variant="destructive" role="alert"><AlertDescription>{error}{conflict ? <Button className="ml-3" size="sm" variant="outline" disabled={saving} onClick={() => void reload()}>최신 템플릿 불러오기</Button> : null}</AlertDescription></Alert> : null}
      {notice ? <Alert role="status"><AlertDescription>{notice}</AlertDescription></Alert> : null}
      {loading ? <p className="flex items-center gap-2 py-12 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />템플릿을 불러오는 중...</p> : !template ? <Button variant="outline" onClick={() => void reload()}>다시 불러오기</Button> : <>
        <div className="flex flex-wrap items-end gap-4 rounded-xl border bg-background p-5">
          <div className="min-w-56 flex-1"><label htmlFor="wbs-template-name" className="mb-2 block text-sm font-medium">템플릿 이름</label><Input id="wbs-template-name" value={name} maxLength={120} disabled={disabled} onChange={(event) => { setName(event.target.value); setDirty(true); }} /></div>
          <div><label htmlFor="wbs-template-reference" className="mb-2 block text-sm font-medium">기준 웨비나 날짜</label><Input type="date" id="wbs-template-reference" value={referenceDate} disabled={disabled} onChange={(event) => { const date = event.target.value; if (!date) return; setReferenceDate(date); setItems((current) => applyTemplateToCourse(current, date)); setDirty(true); }} /></div>
          {canManage ? <Button disabled={saving || !dirty} onClick={() => void save()}>{saving ? <LoaderCircle className="animate-spin" /> : <Save />}템플릿 저장</Button> : null}
          <p className="w-full text-xs text-muted-foreground">기준 날짜와의 간격을 유지해 강의별 웨비나 날짜에 맞춰 적용합니다. {canManage ? "기존 강의의 일정과 완료 상태는 유지됩니다." : "최고관리자만 템플릿을 수정할 수 있습니다."}</p>
        </div>
        <datalist id="wbs-template-people">{people.map((person) => <option key={person} value={person} />)}</datalist>
        <div className="space-y-4">{items.map((item, index) => {
          const isWebinar = item.id === WEBINAR_ITEM_ID;
          const start = WBS_START_OFFSETS.find((option) => datesForStartOffset(referenceDate, option.daysBefore)?.startDate === item.startDate);
          const due = WBS_DUE_OFFSETS.find((option) => dueDateForOffset(item.startDate, option.daysAfter) === item.dueDate);
          return <section key={item.id} className="rounded-xl border bg-background p-5" aria-label={`템플릿 항목 ${index + 1}`}>
            <div className="mb-4 flex flex-wrap items-center gap-2"><span className="mr-auto text-sm font-medium">항목 {index + 1}</span>
              <Button variant="ghost" size="icon-sm" aria-label={`${index + 1}번째 항목 위로`} disabled={disabled || index === 0} onClick={() => move(index, -1)}><ArrowUp /></Button>
              <Button variant="ghost" size="icon-sm" aria-label={`${index + 1}번째 항목 아래로`} disabled={disabled || index === items.length - 1} onClick={() => move(index, 1)}><ArrowDown /></Button>
              <Button variant="ghost" size="icon-sm" aria-label={`${index + 1}번째 항목 삭제`} disabled={disabled || isWebinar} className="text-destructive" onClick={() => { if (window.confirm("이 항목을 템플릿에서 삭제할까요?")) { setItems((current) => current.filter((entry) => entry.id !== item.id).map((entry, position) => ({ ...entry, position }))); setDirty(true); } }}><Trash2 /></Button>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="md:col-span-2"><label htmlFor={`title-${item.id}`} className="mb-2 block text-sm">업무 제목</label><Input id={`title-${item.id}`} value={item.title} maxLength={200} disabled={disabled || isWebinar} onChange={(event) => edit(item.id, { title: event.target.value })} /></div>
              <div><label htmlFor={`owner-${item.id}`} className="mb-2 block text-sm">담당자</label><Input id={`owner-${item.id}`} list="wbs-template-people" value={item.owner} disabled={disabled} onChange={(event) => edit(item.id, { owner: event.target.value })} /></div>
              <div><label htmlFor={`stakeholders-${item.id}`} className="mb-2 block text-sm">관계자</label><Input id={`stakeholders-${item.id}`} list="wbs-template-people" value={item.stakeholders} disabled={disabled} onChange={(event) => edit(item.id, { stakeholders: event.target.value })} /></div>
              <div className="md:col-span-2"><label htmlFor={`description-${item.id}`} className="mb-2 block text-sm">업무 설명</label><Textarea id={`description-${item.id}`} value={item.description} maxLength={2000} disabled={disabled} onChange={(event) => edit(item.id, { description: event.target.value })} /></div>
              <div><label htmlFor={`start-${item.id}`} className="mb-2 block text-sm">시작일</label><select id={`start-${item.id}`} className={selectClass} value={isWebinar ? "webinar" : !item.startDate ? "none" : start ? String(start.daysBefore) : "custom"} disabled={disabled || isWebinar} onChange={(event) => edit(item.id, event.target.value === "none" ? { startDate: "", dueDate: "" } : datesForStartOffset(referenceDate, Number(event.target.value)) ?? {})}>
                <option value="none">일정 없음</option><option value="custom" disabled>기존 일정</option>{isWebinar ? <option value="webinar">무료웨비나 당일</option> : WBS_START_OFFSETS.map((option) => <option key={option.daysBefore} value={option.daysBefore}>{option.label}</option>)}
              </select><p className="mt-1 text-xs text-muted-foreground">{item.startDate || "—"}</p></div>
              <div><label htmlFor={`due-${item.id}`} className="mb-2 block text-sm">마감일</label><select id={`due-${item.id}`} className={selectClass} value={isWebinar ? "webinar" : !item.dueDate ? "none" : due ? String(due.daysAfter) : "custom"} disabled={disabled || isWebinar || !item.startDate} onChange={(event) => edit(item.id, { dueDate: event.target.value === "none" ? "" : dueDateForOffset(item.startDate, Number(event.target.value)) })}>
                <option value="none">일정 없음</option><option value="custom" disabled>기존 일정</option>{isWebinar ? <option value="webinar">무료웨비나 당일</option> : WBS_DUE_OFFSETS.map((option) => <option key={option.daysAfter} value={option.daysAfter}>{option.label}</option>)}
              </select><p className="mt-1 text-xs text-muted-foreground">{item.dueDate || "—"}</p></div>
              <div><label htmlFor={`link-type-${item.id}`} className="mb-2 block text-sm">연결 유형</label><select id={`link-type-${item.id}`} className={selectClass} disabled={disabled} value={item.link?.type || "none"} onChange={(event) => edit(item.id, { link: event.target.value === "none" ? undefined : { type: event.target.value as "internal" | "external", url: "", label: "화면 이동" } })}>
                <option value="none">연결 없음</option><option value="internal">내부 페이지</option><option value="external">외부 페이지</option>
              </select></div>
              {item.link ? <>
                {item.link.type === "internal" ? <div><label htmlFor={`link-page-${item.id}`} className="mb-2 block text-sm">내부 화면 선택</label><select id={`link-page-${item.id}`} className={selectClass} disabled={disabled} value={WBS_INTERNAL_PAGES.some((page) => page.url === item.link?.url) ? item.link.url : "custom"} onChange={(event) => { const page = WBS_INTERNAL_PAGES.find((entry) => entry.url === event.target.value); edit(item.id, { link: { ...item.link!, url: page?.url ?? "", label: page?.label ?? item.link!.label } }); }}><option value="custom">직접 입력</option>{WBS_INTERNAL_PAGES.map((page) => <option key={page.url} value={page.url}>{page.label}</option>)}</select></div> : null}
                <div><label htmlFor={`link-label-${item.id}`} className="mb-2 block text-sm">연결 이름</label><Input id={`link-label-${item.id}`} value={item.link.label} maxLength={120} disabled={disabled} onChange={(event) => edit(item.id, { link: { ...item.link!, label: event.target.value } })} /></div>
                <div className="md:col-span-2"><label htmlFor={`link-url-${item.id}`} className="mb-2 block text-sm">연결 주소</label><Input id={`link-url-${item.id}`} value={item.link.url} maxLength={2000} disabled={disabled} placeholder={item.link.type === "internal" ? "/services/content-management" : "https://example.com"} onChange={(event) => edit(item.id, { link: { ...item.link!, url: event.target.value } })} /><p className="mt-1 text-xs text-muted-foreground">{item.link.type === "internal" ? "내부 경로를 입력하세요. {courseId}는 해당 WBS의 강의 ID로 자동 연결됩니다." : "http:// 또는 https:// 주소를 입력하세요. 새 창에서 열립니다."}</p></div>
              </> : null}
            </div>
          </section>;
        })}</div>
        {canManage ? <div className="flex flex-wrap justify-between gap-3"><Button variant="outline" disabled={saving || items.length >= 500} onClick={() => { setItems((current) => [...current, { id: crypto.randomUUID(), title: "", owner: "", stakeholders: "", startDate: "", dueDate: "", description: "", completed: false, position: current.length }]); setDirty(true); }}><Plus />항목 추가</Button><Button disabled={saving || !dirty} onClick={() => void save()}><Save />템플릿 저장</Button></div> : null}
      </>}
    </div>
  </>;
}
