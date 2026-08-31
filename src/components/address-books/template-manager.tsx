"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Braces, EllipsisVertical, Loader2, Plus, Trash2 } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getTemplateSendTypeLabel } from "@/lib/messages/shoong-guide";

type Template = {
  id: string;
  name: string;
  template_code: string;
  send_type: string;
  applicant_variable: string;
  course_variable: string;
  variable_names: string[];
  is_system: boolean;
  created_at: string;
};

function TemplateCard({
  template,
  deletingId,
  onDelete,
}: {
  template: Template;
  deletingId: string;
  onDelete: (template: Template) => void;
}) {
  const sendTypeLabel = getTemplateSendTypeLabel(template.send_type);
  const variables =
    template.variable_names?.length > 0
      ? template.variable_names
      : [template.applicant_variable, template.course_variable];

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <Braces className="size-5" />
          </span>
          <div className="flex items-start gap-2">
            <div className="flex flex-wrap justify-end gap-2">
              {sendTypeLabel ? (
                <Badge
                  variant="outline"
                  className={
                    sendTypeLabel === "알림톡"
                      ? "border-yellow-400 bg-yellow-300 text-black"
                      : undefined
                  }
                >
                  {sendTypeLabel}
                </Badge>
              ) : null}
              <Badge variant={template.is_system ? "default" : "secondary"}>
                {template.is_system ? "기본 템플릿" : "사용자 템플릿"}
              </Badge>
            </div>
            {!template.is_system ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`${template.name} 옵션 열기`}
                    disabled={Boolean(deletingId)}
                  >
                    {deletingId === template.id ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <EllipsisVertical />
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => onDelete(template)}
                  >
                    <Trash2 />
                    삭제
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        </div>
        <CardTitle className="mt-3 text-lg">{template.name}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 border-t pt-5">
        <div>
          <p className="text-xs text-muted-foreground">Template Code</p>
          <p className="mt-1 break-all font-mono text-sm">
            {template.template_code}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">템플릿 변수</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {[...new Set(variables)].map((variable) => (
              <Badge key={variable} variant="outline">
                {variable}
              </Badge>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function TemplateManager({
  templates,
  loadError,
}: {
  templates: Template[];
  loadError?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [guide, setGuide] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deletingId, setDeletingId] = useState("");

  function handleOpenChange(nextOpen: boolean) {
    if (saving) return;
    setOpen(nextOpen);
    if (!nextOpen) {
      setGuide("");
      setError("");
    }
  }

  async function saveTemplate() {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/message-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guide }),
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.message ?? "템플릿을 저장하지 못했습니다.");
      }
      setOpen(false);
      setGuide("");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "템플릿을 저장하지 못했습니다.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteTemplate(template: Template) {
    if (!window.confirm(`'${template.name}' 템플릿을 삭제할까요?`)) return;

    setDeletingId(template.id);
    setDeleteError("");
    try {
      const response = await fetch(`/api/message-templates/${template.id}`, {
        method: "DELETE",
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.message ?? "템플릿을 삭제하지 못했습니다.");
      }
      router.refresh();
    } catch (caught) {
      setDeleteError(
        caught instanceof Error
          ? caught.message
          : "템플릿을 삭제하지 못했습니다.",
      );
    } finally {
      setDeletingId("");
    }
  }

  const alimtalkTemplates = templates.filter((template) =>
    ["ai", "at"].includes(template.send_type.trim().toLowerCase()),
  );
  const smsTemplates = templates.filter(
    (template) => template.send_type.trim().toLowerCase() === "sms",
  );
  const lmsTemplates = templates.filter(
    (template) => template.send_type.trim().toLowerCase() === "lms",
  );
  const otherTemplates = templates.filter(
    (template) =>
      !["ai", "at", "sms", "lms"].includes(
        template.send_type.trim().toLowerCase(),
      ),
  );
  const templateSections = [
    {
      key: "alimtalk",
      title: "알림톡 템플릿",
      description: "Shoong sendType이 ai 또는 at인 템플릿입니다.",
      templates: alimtalkTemplates,
    },
    {
      key: "sms",
      title: "문자 SMS 템플릿",
      description: "Shoong sendType이 sms인 문자 템플릿입니다.",
      templates: smsTemplates,
    },
    {
      key: "lms",
      title: "문자 LMS 템플릿",
      description: "Shoong sendType이 LMS인 장문 문자 템플릿입니다.",
      templates: lmsTemplates,
    },
    ...(otherTemplates.length > 0
      ? [
          {
            key: "other",
            title: "기타 템플릿",
            description: "분류되지 않은 sendType의 템플릿입니다.",
            templates: otherTemplates,
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-primary">SHOONG TEMPLATES</p>
          <h1 className="mt-2 text-3xl font-semibold">템플릿 관리</h1>
          <p className="mt-2 text-muted-foreground">
            Shoong API 연동 가이드를 붙여넣어 발송 템플릿을 등록합니다.
          </p>
        </div>
        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogTrigger asChild>
            <Button>
              <Plus />
              템플릿 추가
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>Shoong 템플릿 추가</DialogTitle>
              <DialogDescription>
                Shoong 개발자 도구의 API 연동 가이드 전체를 복사해서
                붙여넣으세요. 템플릿 이름·코드·변수명만 저장하며 API 키는
                저장하지 않습니다.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="shoong-integration-guide">API 연동 가이드</Label>
              <Textarea
                id="shoong-integration-guide"
                className="h-72 min-h-72 max-h-72 resize-none overflow-y-auto font-mono text-xs field-sizing-fixed"
                placeholder="API 연동 가이드 전체를 여기에 붙여넣으세요."
                value={guide}
                onChange={(event) => setGuide(event.target.value)}
              />
            </div>
            {error ? (
              <Alert variant="destructive">
                <AlertTitle>템플릿을 추가할 수 없습니다</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={saving}
              >
                취소
              </Button>
              <Button onClick={saveTemplate} disabled={saving || !guide.trim()}>
                {saving ? <Loader2 className="animate-spin" /> : <Plus />}
                {saving ? "가이드 분석·저장 중" : "분석 후 템플릿 저장"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {loadError ? (
        <Alert variant="destructive">
          <AlertTitle>템플릿 조회 실패</AlertTitle>
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      ) : null}
      {deleteError ? (
        <Alert variant="destructive">
          <AlertTitle>템플릿을 삭제할 수 없습니다</AlertTitle>
          <AlertDescription>{deleteError}</AlertDescription>
        </Alert>
      ) : null}

      {!loadError ? (
        <div className="space-y-10">
          {templateSections.map((section) => (
            <section key={section.key} aria-labelledby={`${section.key}-title`}>
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2
                    id={`${section.key}-title`}
                    className="text-xl font-semibold"
                  >
                    {section.title}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {section.description}
                  </p>
                </div>
                <Badge variant="secondary">{section.templates.length}개</Badge>
              </div>

              {section.templates.length === 0 ? (
                <Card>
                  <CardContent className="py-10 text-center text-sm text-muted-foreground">
                    등록된 {section.title}이 없습니다.
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                  {section.templates.map((template) => (
                    <TemplateCard
                      key={template.id}
                      template={template}
                      deletingId={deletingId}
                      onDelete={deleteTemplate}
                    />
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      ) : null}
    </div>
  );
}
