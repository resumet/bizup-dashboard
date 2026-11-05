"use client";

import { FileText, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

  async function saveTemplate(content: CourseDocumentBlock[]) {
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
    setDraft(null);
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
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {templates.map((template) => (
            <Card key={template.id} className="py-0">
              <CardContent className="flex items-start justify-between gap-4 p-5">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => openTemplate(template)}>
                  <span className="flex items-center gap-2 font-semibold hover:text-primary hover:underline">
                    <FileText className="size-4 shrink-0" aria-hidden="true" />
                    <span className="truncate">{template.name}</span>
                  </span>
                  <span className="mt-2 block text-xs text-muted-foreground">
                    {template.updatedAt ? `${dateTime.format(new Date(template.updatedAt))} 수정` : "기본 템플릿"}
                  </span>
                </button>
                <div className="flex shrink-0 gap-1">
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
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="flex min-h-72 flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 text-center text-muted-foreground">
          <FileText className="size-10" aria-hidden="true" />
          <p>저장된 계약서 템플릿이 없습니다.</p>
          <Button type="button" variant="outline" onClick={openNewTemplate}><Plus aria-hidden="true" />첫 템플릿 만들기</Button>
        </div>
      )}

      <Dialog open={Boolean(draft)} onOpenChange={(open) => { if (!open) setDraft(null); }}>
        <DialogContent className="flex h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-none flex-col overflow-hidden p-0 sm:w-[94vw] sm:max-w-[94vw]">
          <DialogHeader className="shrink-0 border-b px-6 py-5">
            <DialogTitle>{draft?.id ? "계약서 템플릿 수정" : "새 계약서 템플릿"}</DialogTitle>
            <DialogDescription className="sr-only">이름과 계약서 원문을 편집합니다.</DialogDescription>
          </DialogHeader>
          {draft ? (
            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
              <div className="mb-4 space-y-2">
                <Label htmlFor="contract-template-name">템플릿 이름</Label>
                <Input
                  id="contract-template-name"
                  value={draft.name}
                  maxLength={100}
                  autoFocus
                  onChange={(event) => setDraft((current) => current ? { ...current, name: event.target.value } : current)}
                />
              </div>
              <div className="mb-4 rounded-lg border bg-muted/35 px-4 py-3 text-sm leading-6 text-muted-foreground">
                원문 전체를 그대로 붙여넣을 수 있으며 줄바꿈과 연속된 띄어쓰기도 저장됩니다. 강사명 <code>{"{{instructorName}}"}</code>, 강의명 <code>{"{{lectureName}}"}</code>, 계약기간 <code>{"{{contractPeriod}}"}</code>, 릴스 대행 갯수 <code>{"{{instagram_number_of_reels}}"}</code>, 릴스 대행 금액 <code>{"{{instagram_value_of_reels}}"}</code>, 주소·연락처는 <code>{"{{address}}"}</code> · <code>{"{{phone}}"}</code> · <code>{"{{email}}"}</code>을 사용하세요.
              </div>
              <CourseDocumentEditor
                key={draft.editorKey}
                mode="contract"
                courseName={draft.name.trim() || "새 계약서 템플릿"}
                initialContent={draft.template.content}
                onSaveContent={saveTemplate}
                allowSaveWhenClean
              />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
