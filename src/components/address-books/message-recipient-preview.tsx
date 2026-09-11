"use client";

import { useState } from "react";
import Link from "next/link";
import { Eye, Loader2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPhone } from "@/lib/jobs/filter";

type Recipient = {
  id: string;
  name: string;
  phone: string;
  variables: Record<string, string>;
  phoneError: string | null;
  content: string;
  missingVariables: string[];
};

export function MessageRecipientPreview({ bookId, contactId, templateId, templateName, variables, recipientNameVariables, settingsKey, ready }: {
  bookId: string;
  contactId?: string;
  templateId: string;
  templateName: string;
  variables: Record<string, string>;
  recipientNameVariables: string[];
  settingsKey: string;
  ready: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ key: string; recipients: Recipient[]; hasBody: boolean; error: string } | null>(null);
  const current = result?.key === settingsKey ? result : null;

  async function preview() {
    setLoading(true);
    setResult(null);
    try {
      const response = await fetch(`/api/address-books/${bookId}/messages/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId, contactId, variables, recipientNameVariables }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message ?? "미리보기를 불러오지 못했습니다.");
      setResult({ key: settingsKey, recipients: body.recipients, hasBody: body.hasBody, error: "" });
    } catch (error) {
      setResult({ key: settingsKey, recipients: [], hasBody: false, error: error instanceof Error ? error.message : "미리보기를 불러오지 못했습니다." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><Eye className="size-5" />고객별 발송 미리보기</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {contactId ? "선택한 고객" : "발송 대상 중 첫 10명"}에게 적용될 내용을 확인합니다. 미리보기는 문자를 발송하지 않습니다.
          </p>
          <Button type="button" variant="outline" onClick={preview} disabled={!ready || loading}>
            {loading ? <Loader2 className="animate-spin" /> : <Eye />}
            {loading ? "불러오는 중" : contactId ? "고객 미리보기" : "첫 10명 미리보기"}
          </Button>
        </div>
        {!ready ? <p className="text-sm text-muted-foreground">주소록·템플릿을 선택하고 변수를 입력해 주세요.</p> : null}
        {result && !current ? <p className="text-sm text-muted-foreground">발송 설정이 변경되었습니다. 미리보기를 다시 확인해 주세요.</p> : null}
        <div aria-live="polite">
          {current?.error ? <Alert variant="destructive"><AlertTitle>미리보기 조회 실패</AlertTitle><AlertDescription>{current.error}</AlertDescription></Alert> : null}
          {current && !current.error && current.recipients.length === 0 ? <p className="text-sm text-muted-foreground">미리보기할 고객이 없습니다.</p> : null}
          {current && current.recipients.length > 0 ? (
            <div className="space-y-3">
              <p className="text-sm font-medium">{templateName} · {current.recipients.length}명</p>
              <p className="text-sm text-muted-foreground">
                {current.hasBody ? "저장한 미리보기 본문에 고객별 변수를 적용했습니다. 발송 서비스에 등록된 최신 본문과 일치하는지 확인해 주세요." : "저장된 본문이 없어 고객별 변수 값만 표시합니다. 전체 내용을 보려면 템플릿 관리에서 미리보기 본문을 설정해 주세요."}
                {" "}<Link href="/services/message-automation/templates" className="underline">템플릿 관리</Link>
              </p>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {current.recipients.map((recipient, index) => (
                  <div key={recipient.id} className="min-w-0 space-y-3 rounded-xl border bg-muted/20 p-4">
                    <div><p className="font-medium">{index + 1}. {recipient.name || "이름 없음"}</p><p className="text-sm text-muted-foreground">{formatPhone(recipient.phone)}</p></div>
                    {recipient.phoneError ? <p className="text-sm text-destructive">{recipient.phoneError}</p> : null}
                    {current.hasBody ? <p className="whitespace-pre-wrap break-words rounded-lg bg-background p-3 text-sm">{recipient.content}</p> : null}
                    {recipient.missingVariables.length > 0 ? <p className="text-sm text-destructive">값이 없는 변수: {recipient.missingVariables.join(", ")}</p> : null}
                    <details open={!current.hasBody}><summary className="cursor-pointer text-sm text-muted-foreground">적용된 변수</summary><dl className="mt-2 space-y-2 text-sm">
                      {Object.entries(recipient.variables).map(([name, value]) => <div key={name}><dt className="text-muted-foreground">{name}</dt><dd className="whitespace-pre-wrap break-words">{value || "(빈 값)"}</dd></div>)}
                    </dl></details>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
