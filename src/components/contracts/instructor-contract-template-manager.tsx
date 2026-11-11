"use client";

import { FileText, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DEFAULT_INSTRUCTOR_CONTRACT_TEMPLATE,
  type InstructorContractTemplate,
  type InstructorContractTemplateRecord,
} from "@/lib/contracts/instructor-contract";
import type { CourseDocumentBlock } from "@/lib/course-documents/types";

const CourseDocumentEditor = dynamic(
  () => import("@/components/course-documents/document-editor").then((module) => module.CourseDocumentEditor),
  { ssr: false, loading: () => <p className="py-16 text-center text-sm text-muted-foreground">편집기를 불러오는 중입니다.</p> },
);

type Draft = {
  id: string | null;
  name: string;
  template: InstructorContractTemplate;
  editorKey: string;
};

type TemplateResponse = {
  template?: InstructorContractTemplateRecord;
  message?: string;
};

const dateTime = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export function InstructorContractTemplateManager({
  initialTemplates,
}: {
  initialTemplates: InstructorContractTemplateRecord[];
}) {
  const [templates, setTemplates] = useState(initialTemplates);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [saveRequest, setSaveRequest] = useState(0);
  const [savingTemplate, setSavingTemplate] = useState(false);

  function openNewTemplate() {
    setError("");
    setDraft({
      id: null,
      name: "",
      template: DEFAULT_INSTRUCTOR_CONTRACT_TEMPLATE,
      editorKey: crypto.randomUUID(),
    });
  }

  function openTemplate(template: InstructorContractTemplateRecord) {
    setError("");
    setDraft({
      id: template.id,
      name: template.name,
      template: template.template,
      editorKey: template.id,
    });
  }

  async function saveTemplate(content: CourseDocumentBlock[], options?: { auto: boolean }) {
    if (!draft) throw new Error("저장할 템플릿을 확인해 주세요.");
    const name = draft.name.trim();
    if (!name) throw new Error("템플릿 이름을 입력해 주세요.");
    const endpoint = draft.id ? `/api/contracts/templates/${draft.id}` : "/api/contracts/templates";
    const response = await fetch(endpoint, {
      method: draft.id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, template: { version: 2, content } }),
    });
    const result = await response.json() as TemplateResponse;
    if (!response.ok || !result.template) {
      throw new Error(result.message || "계약서 템플릿을 저장하지 못했습니다.");
    }
    setTemplates((current) => {
      const withoutSaved = current.filter((template) => template.id !== result.template?.id);
      return [result.template as InstructorContractTemplateRecord, ...withoutSaved];
    });
  }

  async function deleteTemplate(template: InstructorContractTemplateRecord) {
    if (!window.confirm(`'${template.name}' 템플릿을 삭제할까요? 기존에 저장된 계약서는 그대로 유지됩니다.`)) return;
    setDeletingId(template.id);
    setError("");
    try {
      const response = await fetch(`/api/contracts/templates/${template.id}`, { method: "DELETE" });
      const result = await response.json() as { message?: string };
      if (!response.ok) throw new Error(result.message || "계약서 템플릿을 삭제하지 못했습니다.");
      setTemplates((current) => current.filter((entry) => entry.id !== template.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "계약서 템플릿을 삭제하지 못했습니다.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <Button type="button" onClick={openNewTemplate}><Plus aria-hidden="true" />새 템플릿</Button>
      </div>

      {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}

      {templates.length ? (
        <div className="overflow-hidden rounded-xl border bg-card">
          <div aria-hidden="true" className="hidden grid-cols-[minmax(0,1fr)_13rem_6rem] items-center gap-4 border-b bg-muted/40 px-5 py-3 text-xs font-medium text-muted-foreground sm:grid">
            <span>템플릿 이름</span>
            <span>최근 수정</span>
            <span className="text-right">관리</span>
          </div>
          <ul className="divide-y">
            {templates.map((template) => (
              <li
                key={template.id}
                className="grid gap-3 px-4 py-4 transition-colors hover:bg-muted/30 focus-within:bg-muted/30 sm:grid-cols-[minmax(0,1fr)_13rem_6rem] sm:items-center sm:gap-4 sm:px-5"
              >
                <button type="button" className="flex min-w-0 items-center gap-2 text-left font-semibold hover:text-primary hover:underline" onClick={() => openTemplate(template)}>
                  <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="truncate">{template.name}</span>
                </button>
                <div className="text-sm text-muted-foreground">
                  <span className="mr-2 sm:sr-only">최근 수정</span>
                  <span className="whitespace-nowrap">
                    {template.updatedAt ? dateTime.format(new Date(template.updatedAt)) : "기본 템플릿"}
                  </span>
                </div>
                <div className="flex justify-end gap-1">
                  <Button type="button" size="icon-sm" variant="ghost" aria-label={`${template.name} 수정`} onClick={() => openTemplate(template)}>
                    <Pencil aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    className="text-destructive"
                    aria-label={`${template.name} 삭제`}
                    disabled={deletingId === template.id}
                    onClick={() => void deleteTemplate(template)}
                  >
                    {deletingId === template.id ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Trash2 aria-hidden="true" />}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="flex min-h-72 flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 text-center text-muted-foreground">
          <FileText className="size-10" aria-hidden="true" />
          <p>저장된 계약서 템플릿이 없습니다.</p>
          <Button type="button" variant="outline" onClick={openNewTemplate}><Plus aria-hidden="true" />첫 템플릿 만들기</Button>
        </div>
      )}

      {draft ? <div className="fixed inset-0 z-50 flex flex-col bg-background">
        <header className="flex shrink-0 items-center gap-3 border-b px-5 py-3 sm:px-8">
          <Input id="contract-template-name" value={draft.name} maxLength={100} autoFocus aria-label="템플릿 이름" className="max-w-xl text-lg font-semibold" onChange={(event) => setDraft((current) => current ? { ...current, name: event.target.value } : current)} />
          <Button type="button" size="sm" disabled={savingTemplate} onClick={() => setSaveRequest((current) => current + 1)}>{savingTemplate ? "저장 중" : "저장하기"}</Button>
          <Button type="button" size="icon-sm" variant="ghost" className="ml-auto" aria-label="템플릿 편집 닫기" onClick={() => setDraft(null)}><X /></Button>
        </header>
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden p-4 sm:p-6">
          <CourseDocumentEditor key={draft.editorKey} mode="contract" courseName={draft.name.trim() || "새 계약서 템플릿"} initialContent={draft.template.content} onSaveContent={saveTemplate} allowSaveWhenClean autoSaveIntervalMs={60_000} onExitAfterSave={() => setDraft(null)} saveRequest={saveRequest} onSavingChange={setSavingTemplate} />
        </main>
      </div> : null}
    </div>
  );
}
