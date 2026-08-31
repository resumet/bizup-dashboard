"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { DefaultMessageTemplate } from "@/lib/message-studio/default-template-server";

export function DefaultTemplateManager({
  templates,
}: {
  templates: DefaultMessageTemplate[];
}) {
  const router = useRouter();
  const visible = templates.filter((template) => template.content.trim());
  const [drafts, setDrafts] = useState<Record<number, string>>(() =>
    Object.fromEntries(
      templates.map((template) => [template.position, template.content]),
    ),
  );
  const [busy, setBusy] = useState<number | "add" | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newContent, setNewContent] = useState("");
  const [error, setError] = useState("");

  async function request(position: number, method: "PATCH" | "DELETE") {
    setBusy(position);
    setError("");
    try {
      const response = await fetch(
        `/api/message-studio/default-templates/${position}`,
        {
          method,
          headers: { "Content-Type": "application/json" },
          body:
            method === "PATCH"
              ? JSON.stringify({ content: drafts[position] })
              : undefined,
        },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.message ?? "처리하지 못했습니다.");
      if (method === "DELETE") {
        setDrafts((current) => ({ ...current, [position]: "" }));
      }
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "처리하지 못했습니다.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function add() {
    setBusy("add");
    setError("");
    try {
      const response = await fetch("/api/message-studio/default-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newContent }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message ?? "추가하지 못했습니다.");
      setDrafts((current) => ({
        ...current,
        [body.position as number]: body.content as string,
      }));
      setNewContent("");
      setAddOpen(false);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "추가하지 못했습니다.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <Badge variant="outline">{visible.length}/30 사용 중</Badge>
          <h1 className="mt-3 text-3xl font-semibold">기본 문자 템플릿</h1>
          <p className="mt-2 text-muted-foreground">
            새 문자 제작 프로젝트의 왼쪽 예시 영역에 적용될 기본 문자를
            관리합니다.
          </p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button disabled={visible.length >= 30}>
              <Plus />
              기본 템플릿 추가
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>기본 문자 추가</DialogTitle>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="new-default-message">문자 내용</Label>
              <Textarea
                id="new-default-message"
                className="h-64 resize-none overflow-y-auto"
                value={newContent}
                onChange={(event) => setNewContent(event.target.value)}
              />
            </div>
            <DialogFooter>
              <Button
                onClick={add}
                disabled={busy !== null || !newContent.trim()}
              >
                {busy === "add" ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Plus />
                )}
                추가
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>처리할 수 없습니다</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-5 xl:grid-cols-2">
        {visible.map((template) => (
          <Card key={template.position}>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base">
                기본 템플릿 {template.position}
              </CardTitle>
              <Badge variant="secondary">
                {drafts[template.position]?.length ?? 0}자
              </Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                className="h-72 resize-none overflow-y-auto"
                aria-label={`기본 템플릿 ${template.position} 내용`}
                value={drafts[template.position] ?? ""}
                onChange={(event) =>
                  setDrafts((current) => ({
                    ...current,
                    [template.position]: event.target.value,
                  }))
                }
              />
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  disabled={busy !== null}
                  onClick={() => {
                    if (
                      window.confirm(
                        `${template.position}번 기본 템플릿을 삭제할까요?`,
                      )
                    )
                      void request(template.position, "DELETE");
                  }}
                >
                  <Trash2 />
                  삭제
                </Button>
                <Button
                  disabled={busy !== null || !drafts[template.position]?.trim()}
                  onClick={() => void request(template.position, "PATCH")}
                >
                  {busy === template.position ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Save />
                  )}
                  저장
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
