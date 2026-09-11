"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Eye, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getTemplateSendTypeLabel } from "@/lib/messages/shoong-guide";

export function SelectedTemplatePreview({ templateId, name, sendType }: {
  templateId: string;
  name: string;
  sendType: string;
}) {
  const [result, setResult] = useState<{ body: string; error: string } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`/api/message-templates/${encodeURIComponent(templateId)}/preview`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message ?? "미리보기를 불러오지 못했습니다.");
        if (!controller.signal.aborted) setResult({ body: data.body, error: "" });
      } catch (error) {
        if (!controller.signal.aborted) setResult({ body: "", error: error instanceof Error ? error.message : "미리보기를 불러오지 못했습니다." });
      }
    }
    void load();
    return () => controller.abort();
  }, [templateId, attempt]);

  return (
    <section className="space-y-3 rounded-xl border bg-muted/30 p-4" aria-label="선택한 템플릿 미리보기" aria-busy={!result}>
      <p className="flex items-center gap-2 text-sm font-medium"><Eye className="size-4" />{getTemplateSendTypeLabel(sendType)} 미리보기</p>
      <div aria-live="polite">
        {!result ? (
          <p className="flex items-center gap-2 py-5 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />본문을 불러오는 중입니다.</p>
        ) : result.error ? (
          <div className="space-y-2">
            <p className="text-sm text-destructive">{result.error}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => { setResult(null); setAttempt((current) => current + 1); }}>다시 불러오기</Button>
          </div>
        ) : result.body.trim() ? (
          <div className="rounded-xl border bg-background p-4 shadow-sm">
            <p className="mb-3 break-words text-sm font-semibold">{name}</p>
            <div className="max-h-80 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-relaxed">{result.body}</div>
          </div>
        ) : (
          <p className="py-3 text-sm text-muted-foreground">저장된 미리보기 본문이 없습니다. 템플릿 관리에서 본문을 설정해 주세요.</p>
        )}
      </div>
      <p className="text-xs text-muted-foreground">저장된 템플릿 본문입니다. 고객별 적용 내용은 아래 ‘고객별 발송 미리보기’에서 확인하세요.</p>
      <Link href="/services/message-automation/templates" className="inline-block text-xs underline">템플릿 관리</Link>
    </section>
  );
}
