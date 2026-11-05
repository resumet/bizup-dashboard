"use client";

import { ExternalLink, Pencil, Printer } from "lucide-react";
import dynamic from "next/dynamic";
import { useMemo, useRef, useState } from "react";

import { DocumentRenderer } from "@/components/course-documents/document-renderer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DEFAULT_INSTRUCTOR_CONTRACT_TEMPLATE,
  getContractEndDate,
  getKoreanDate,
  renderInstructorContractTemplate,
  type InstructorContractTemplate,
  type InstructorContractValues,
} from "@/lib/contracts/instructor-contract";
import type { CourseDocumentBlock } from "@/lib/course-documents/types";
import { printHtmlDocument } from "@/lib/course-settlements/print";

const CourseDocumentEditor = dynamic(
  () => import("@/components/course-documents/document-editor").then((module) => module.CourseDocumentEditor),
  { ssr: false, loading: () => <p className="py-16 text-center text-sm text-muted-foreground">편집기를 불러오는 중입니다.</p> },
);

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

const CONTRACT_PRINT_STYLES = `<style>
@page{size:A4;margin:12mm}.contract-print{color:#0f172a;font-family:Pretendard,"Noto Sans KR",Arial,sans-serif}.contract-print *{box-sizing:border-box}.contract-print .contract-document{max-width:none!important;padding:0!important;background:#fff;font-size:10.5pt;line-height:1.78}.contract-print .contract-template-content>div{display:block}.contract-print h1{margin:0 0 20px;text-align:center;font-size:21pt;letter-spacing:-.05em}.contract-print h2{margin:18px 0 5px;padding:0;border:0;font-size:11.5pt}.contract-print h3,.contract-print h4{margin:14px 0 4px;font-size:10.5pt}.contract-print p{min-height:1.78em;margin:0;white-space:pre-wrap;word-break:keep-all}.contract-print ul,.contract-print ol{margin:4px 0;padding-left:22px}.contract-print blockquote{margin:8px 0;padding-left:12px;border-left:3px solid #94a3b8}.contract-print table{width:100%;margin:12px 0;border-collapse:collapse;font-size:9.5pt;break-inside:avoid}.contract-print th,.contract-print td{padding:5px 8px;border:1px solid #94a3b8;vertical-align:top}.contract-print th{background:#f8fafc}.contract-print img{display:block;max-width:100%;height:auto;margin:12px auto}@media print{.contract-print{width:100%}}
</style>`;

function ContractArticle({ values, template }: { values: InstructorContractValues; template: InstructorContractTemplate }) {
  const renderedContent = useMemo(() => renderInstructorContractTemplate(template, values), [template, values]);

  return (
    <article className="contract-document mx-auto max-w-[760px] bg-white px-6 py-10 text-[14px] leading-7 text-slate-950 sm:px-10 sm:py-12">
      <div className="contract-template-content"><DocumentRenderer blocks={renderedContent} variant="contract" /></div>
    </article>
  );
}

export function InstructorContractWriter({ initialTemplate = DEFAULT_INSTRUCTOR_CONTRACT_TEMPLATE, canEditTemplate = false }: { initialTemplate?: InstructorContractTemplate; canEditTemplate?: boolean }) {
  const [values, setValues] = useState<InstructorContractValues>(INITIAL_VALUES);
  const [template, setTemplate] = useState<InstructorContractTemplate>(initialTemplate);
  const [templateEditorOpen, setTemplateEditorOpen] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const endDate = useMemo(() => getContractEndDate(values.startDate, values.durationYears), [values.durationYears, values.startDate]);

  function update<K extends keyof InstructorContractValues>(key: K, value: InstructorContractValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function printContract() {
    if (!previewRef.current) return;
    const title = `${display(values.instructorName, "강사")}_비즈업클래스_강사_계약서`;
    printHtmlDocument(title, `${CONTRACT_PRINT_STYLES}<main class="contract-print">${previewRef.current.innerHTML}</main>`);
  }

  function openTemplateEditor() {
    setTemplateEditorOpen(true);
  }

  async function saveTemplate(content: CourseDocumentBlock[]) {
    const response = await fetch("/api/contracts/template", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: 2, content }),
    });
    const result = await response.json() as { template?: InstructorContractTemplate; message?: string };
    if (!response.ok || !result.template) {
      throw new Error(result.message || "계약서 템플릿을 저장하지 못했습니다.");
    }
    setTemplate(result.template);
    setTemplateEditorOpen(false);
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
        <DialogContent className="flex h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-none flex-col overflow-hidden p-0 sm:w-[94vw] sm:max-w-[94vw]">
          <DialogHeader className="shrink-0 border-b px-6 py-5">
            <DialogTitle>계약서 템플릿 수정</DialogTitle>
            <DialogDescription className="sr-only">계약서 전체 원문을 편집합니다.</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
            <div className="mb-4 rounded-lg border bg-muted/35 px-4 py-3 text-sm leading-6 text-muted-foreground">
              원문 전체를 그대로 붙여넣을 수 있으며 줄바꿈과 연속된 띄어쓰기도 저장됩니다. 강사명 <code>{"{{instructorName}}"}</code>, 강의명 <code>{"{{lectureName}}"}</code>, 계약기간 <code>{"{{contractPeriod}}"}</code>, 주소·연락처는 <code>{"{{address}}"}</code> · <code>{"{{phone}}"}</code> · <code>{"{{email}}"}</code>을 사용하세요.
            </div>
            {templateEditorOpen ? (
              <CourseDocumentEditor
                mode="contract"
                courseName="계약서 템플릿"
                initialContent={template.content}
                onSaveContent={saveTemplate}
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
