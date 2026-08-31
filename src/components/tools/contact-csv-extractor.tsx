"use client";

import { useState, type FormEvent } from "react";
import {
  CheckCircle2,
  ClipboardPaste,
  Download,
  Loader2,
  X,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

type ExtractionResult = {
  count: number;
  blob: Blob;
  filename: string;
};

export function ContactCsvExtractor() {
  const [text, setText] = useState("");
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");

  function downloadResult(extraction: ExtractionResult) {
    const url = URL.createObjectURL(extraction.blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = extraction.filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function extract(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!text.trim()) return;
    setProcessing(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/tools/contact-csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.message ?? "연락처를 추출하지 못했습니다.");
      }
      const extraction: ExtractionResult = {
        count: Number(response.headers.get("X-Extracted-Count") ?? 0),
        blob: await response.blob(),
        filename: "붙여넣기_연락처.csv",
      };
      setResult(extraction);
      downloadResult(extraction);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "연락처를 추출하지 못했습니다.",
      );
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Badge className="mb-3 bg-teal-600 text-white hover:bg-teal-600">
          간편 도구
        </Badge>
        <h1 className="text-3xl font-semibold tracking-tight">
          연락처 CSV 추출
        </h1>
        <p className="mt-2 text-muted-foreground">
          엑셀의 이름, 전화번호, 이메일 3열을 순서대로 붙여넣으면 CSV
          파일로 만듭니다.
        </p>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>처리할 수 없습니다.</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {result ? (
        <Alert className="border-teal-500/40 bg-teal-500/5">
          <CheckCircle2 className="text-teal-600" />
          <AlertTitle>연락처 CSV를 만들었습니다.</AlertTitle>
          <AlertDescription>
            {result.count.toLocaleString("ko-KR")}행을 추출했습니다. 전화번호는
            000-0000-0000 형식으로 정리했습니다.
          </AlertDescription>
        </Alert>
      ) : null}

      <Card className="overflow-hidden border-teal-500/30">
        <CardHeader className="border-b bg-teal-500/5">
          <CardTitle className="flex items-center gap-2 text-lg">
            <ClipboardPaste className="text-teal-600" />
            엑셀 내용 붙여넣기
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <form onSubmit={extract} className="space-y-5">
            <div className="space-y-2">
              <Textarea
                className="min-h-80 resize-y border-teal-500/40 bg-teal-500/[0.03] font-mono leading-6 focus-visible:ring-teal-500/30"
                placeholder={
                  "엑셀에서 헤더를 포함한 3열을 복사해 붙여넣으세요.\n\n이름\t전화번호\t이메일\n홍길동\t010-1234-5678\thong@example.com\n김영희\t010-9876-5432\tkim@example.com"
                }
                value={text}
                onChange={(event) => {
                  setText(event.target.value);
                  setResult(null);
                  setError("");
                }}
              />
              <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  첫 3열을 이름 / 전화번호 / 이메일 순서로 붙여넣으세요. 첫
                  행은 헤더로 제외됩니다.
                </span>
                <span>{text.length.toLocaleString("ko-KR")}자</span>
              </div>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <Button
                type="button"
                variant="ghost"
                disabled={!text || processing}
                onClick={() => {
                  setText("");
                  setResult(null);
                  setError("");
                }}
              >
                <X /> 내용 지우기
              </Button>
              <div className="flex flex-wrap gap-2">
                {result ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => downloadResult(result)}
                  >
                    <Download /> 다시 다운로드
                  </Button>
                ) : null}
                <Button
                  type="submit"
                  className="bg-teal-600 text-white hover:bg-teal-700"
                  disabled={!text.trim() || processing}
                >
                  {processing ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Download />
                  )}
                  {processing ? "추출 중" : "CSV 만들기"}
                </Button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
