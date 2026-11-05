"use client";

import { ExternalLink, Loader2, Pencil, Printer, Save } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  COMPANY_CONTRACT_DETAILS,
  DEFAULT_INSTRUCTOR_CONTRACT_TEMPLATE,
  getContractEndDate,
  getKoreanDate,
  type InstructorContractTemplate,
  type InstructorContractValues,
} from "@/lib/contracts/instructor-contract";
import { printHtmlDocument } from "@/lib/course-settlements/print";
import { Textarea } from "@/components/ui/textarea";

const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });

const INITIAL_VALUES: InstructorContractValues = {
  instructorName: "",
  lectureName: "",
  startDate: today,
  durationYears: 1,
  address: "",
  phone: "",
  email: "",
};

function display(value: string, fallback = "입력 예정") {
  return value.trim() || fallback;
}

function replaceVariables(text: string, values: InstructorContractValues) {
  return text
    .replaceAll("{{instructorName}}", display(values.instructorName))
    .replaceAll("{{lectureName}}", display(values.lectureName));
}

function circledNumber(index: number) {
  return index < 20 ? String.fromCodePoint(0x2460 + index) : `${index + 1}.`;
}

function ContractArticle({ values, template }: { values: InstructorContractValues; template: InstructorContractTemplate }) {
  const endDate = getContractEndDate(values.startDate, values.durationYears);
  const contractPeriod = `${getKoreanDate(values.startDate) || "시작일 입력 예정"} ~ ${getKoreanDate(endDate) || "종료일 입력 예정"} (${values.durationYears || 1}년간)`;

  return (
    <article className="contract-document mx-auto max-w-[760px] bg-white px-6 py-10 text-[14px] leading-7 text-slate-950 sm:px-10 sm:py-12">
      <h1 className="text-center text-2xl font-bold tracking-[-0.04em]">비즈업클래스 강사 계약서</h1>
      <p className="mt-9 break-keep text-justify indent-4">
        {replaceVariables(template.introduction, values)}
      </p>

      <dl className="mt-8 overflow-hidden rounded border border-slate-300 text-sm">
        <div className="grid grid-cols-[7rem_1fr] border-b border-slate-300 last:border-b-0">
          <dt className="bg-slate-50 px-3 py-2 font-semibold">계약기간</dt>
          <dd className="px-3 py-2">{contractPeriod}</dd>
        </div>
        <div className="grid grid-cols-[7rem_1fr] border-b border-slate-300 last:border-b-0">
          <dt className="bg-slate-50 px-3 py-2 font-semibold">강의명</dt>
          <dd className="px-3 py-2">{display(values.lectureName, "강의명")}</dd>
        </div>
      </dl>

      <div className="mt-10 space-y-7">
        {template.sections.map((section) => (
          <section key={section.title} className="break-inside-avoid">
            <h2 className="font-bold">{section.title}</h2>
            <div className="mt-2 space-y-2 break-keep text-justify">
              {section.paragraphs.map((paragraph, index) => (
                <p key={`${section.title}-${index}`} className="grid grid-cols-[1.8rem_1fr] gap-1"><span className="font-semibold" aria-hidden="true">{circledNumber(index)}</span><span>{replaceVariables(paragraph, values)}</span></p>
              ))}
            </div>
          </section>
        ))}
      </div>

      <section className="mt-12 grid gap-4 text-sm sm:grid-cols-2">
        <div className="rounded border border-slate-300 p-4">
          <p className="font-bold">“회사”</p>
          <dl className="mt-3 space-y-1.5">
            <div><dt className="inline text-slate-600">상호 </dt><dd className="inline">{COMPANY_CONTRACT_DETAILS.name}</dd></div>
            <div><dt className="inline text-slate-600">주소 </dt><dd className="inline">{COMPANY_CONTRACT_DETAILS.address}</dd></div>
            <div><dt className="inline text-slate-600">대표이사 </dt><dd className="inline">{COMPANY_CONTRACT_DETAILS.representative} (인)</dd></div>
          </dl>
        </div>
        <div className="rounded border border-slate-300 p-4">
          <p className="font-bold">“강사”</p>
          <dl className="mt-3 space-y-1.5">
            <div><dt className="inline text-slate-600">성명 </dt><dd className="inline">{display(values.instructorName, "강사명")} (인)</dd></div>
            <div><dt className="inline text-slate-600">주소 </dt><dd className="inline">{display(values.address)}</dd></div>
            <div><dt className="inline text-slate-600">전화번호 </dt><dd className="inline">{display(values.phone)}</dd></div>
            <div><dt className="inline text-slate-600">이메일 </dt><dd className="inline">{display(values.email)}</dd></div>
          </dl>
        </div>
      </section>
    </article>
  );
}

export function InstructorContractWriter({ initialTemplate = DEFAULT_INSTRUCTOR_CONTRACT_TEMPLATE, canEditTemplate = false }: { initialTemplate?: InstructorContractTemplate; canEditTemplate?: boolean }) {
  const [values, setValues] = useState<InstructorContractValues>(INITIAL_VALUES);
  const [template, setTemplate] = useState<InstructorContractTemplate>(initialTemplate);
  const [draftTemplate, setDraftTemplate] = useState<InstructorContractTemplate>(initialTemplate);
  const [templateEditorOpen, setTemplateEditorOpen] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateError, setTemplateError] = useState("");
  const previewRef = useRef<HTMLDivElement>(null);
  const endDate = useMemo(() => getContractEndDate(values.startDate, values.durationYears), [values.durationYears, values.startDate]);

  function update<K extends keyof InstructorContractValues>(key: K, value: InstructorContractValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function printContract() {
    if (!previewRef.current) return;
    const title = `${display(values.instructorName, "강사")}_비즈업클래스_강사_계약서`;
    printHtmlDocument(title, `<main class="contract-print">${previewRef.current.innerHTML}</main>`);
  }

  function openTemplateEditor() {
    setTemplateError("");
    setDraftTemplate(structuredClone(template));
    setTemplateEditorOpen(true);
  }

  function updateDraftSection(index: number, patch: Partial<InstructorContractTemplate["sections"][number]>) {
    setDraftTemplate((current) => ({ ...current, sections: current.sections.map((section, sectionIndex) => sectionIndex === index ? { ...section, ...patch } : section) }));
  }

  async function saveTemplate() {
    setSavingTemplate(true);
    setTemplateError("");
    try {
      const response = await fetch("/api/contracts/template", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draftTemplate) });
      const result = await response.json() as { template?: InstructorContractTemplate; message?: string };
      if (!response.ok || !result.template) throw new Error(result.message || "계약서 템플릿을 저장하지 못했습니다.");
      setTemplate(result.template);
      setTemplateEditorOpen(false);
    } catch (error) {
      setTemplateError(error instanceof Error ? error.message : "계약서 템플릿을 저장하지 못했습니다.");
    } finally {
      setSavingTemplate(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="outline" asChild>
          <a href="https://glosign.com/" target="_blank" rel="noreferrer"><ExternalLink />글로싸인 바로가기</a>
        </Button>
        {canEditTemplate ? <Button variant="outline" onClick={openTemplateEditor}><Pencil />템플릿 수정</Button> : null}
        <Button onClick={printContract}><Printer />PDF로 저장</Button>
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <Card className="xl:sticky xl:top-21">
          <CardHeader><CardTitle>계약 정보 입력</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2"><Label htmlFor="contract-instructor">강사명</Label><Input id="contract-instructor" value={values.instructorName} onChange={(event) => update("instructorName", event.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="contract-lecture">강의명</Label><Input id="contract-lecture" value={values.lectureName} onChange={(event) => update("lectureName", event.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="contract-start">계약 시작일</Label><Input id="contract-start" type="date" value={values.startDate} onChange={(event) => update("startDate", event.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="contract-duration">계약 기간</Label><Input id="contract-duration" type="number" min="1" max="20" value={values.durationYears} onChange={(event) => update("durationYears", Math.max(1, Number(event.target.value) || 1))} /><p className="text-xs text-muted-foreground">종료일: {getKoreanDate(endDate)}</p></div>
            <div className="space-y-2"><Label htmlFor="contract-address">강사의 주소</Label><Input id="contract-address" value={values.address} onChange={(event) => update("address", event.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="contract-phone">강사의 전화번호</Label><Input id="contract-phone" type="tel" value={values.phone} onChange={(event) => update("phone", event.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="contract-email">강사의 이메일주소</Label><Input id="contract-email" type="email" value={values.email} onChange={(event) => update("email", event.target.value)} /></div>
          </CardContent>
        </Card>

        <section className="overflow-hidden rounded-xl border bg-slate-100 shadow-sm" aria-label="계약서 미리보기">
          <div className="flex items-center justify-between border-b bg-white px-5 py-3"><h2 className="font-semibold">계약서 전문</h2><span className="text-xs text-muted-foreground">입력 내용이 즉시 반영됩니다.</span></div>
          <div className="max-h-[calc(100dvh-12rem)] min-h-[42rem] overflow-y-auto p-3 sm:p-6">
            <div ref={previewRef}><ContractArticle values={values} template={template} /></div>
          </div>
        </section>
      </div>

      <Dialog open={templateEditorOpen} onOpenChange={setTemplateEditorOpen}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-none sm:w-[70vw] max-h-[calc(100dvh-2rem)] overflow-y-auto p-0" showCloseButton={!savingTemplate}>
          <DialogHeader className="border-b px-6 py-5"><DialogTitle>계약서 템플릿 수정</DialogTitle><DialogDescription>강사명은 <code>{"{{instructorName}}"}</code>, 강의명은 <code>{"{{lectureName}}"}</code>으로 입력하면 계약서 작성 시 자동으로 바뀝니다.</DialogDescription></DialogHeader>
          <div className="space-y-6 px-6 py-5">
            <div className="space-y-2"><Label htmlFor="template-introduction">계약서 서문</Label><Textarea id="template-introduction" rows={5} value={draftTemplate.introduction} onChange={(event) => setDraftTemplate((current) => ({ ...current, introduction: event.target.value }))} /></div>
            {draftTemplate.sections.map((section, index) => <section key={`${index}-${section.title}`} className="space-y-3 rounded-xl border p-4"><div className="space-y-2"><Label htmlFor={`template-title-${index}`}>조항 제목</Label><Input id={`template-title-${index}`} value={section.title} onChange={(event) => updateDraftSection(index, { title: event.target.value })} /></div><div className="space-y-2"><Label htmlFor={`template-body-${index}`}>조항 내용</Label><Textarea id={`template-body-${index}`} rows={Math.max(5, section.paragraphs.length + 1)} value={section.paragraphs.join("\n")} onChange={(event) => updateDraftSection(index, { paragraphs: event.target.value.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean) })} /><p className="text-xs text-muted-foreground">줄을 나누면 해당 조의 원형 번호 항목으로 표시됩니다.</p></div></section>)}
            {templateError ? <p className="text-sm font-medium text-destructive">{templateError}</p> : null}
          </div>
          <DialogFooter><Button type="button" variant="outline" disabled={savingTemplate} onClick={() => setTemplateEditorOpen(false)}>취소</Button><Button type="button" disabled={savingTemplate} onClick={() => void saveTemplate()}>{savingTemplate ? <Loader2 className="animate-spin" /> : <Save />}저장</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
