"use client";

import { useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  RotateCcw,
  ShieldCheck,
  UploadCloud,
  XCircle,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  analyzeWorkbook,
  SETTLEMENT_ENGINE_VERSION,
  type MonthlyAnalysis,
  type WorkbookInput,
} from "@/lib/course-settlements/engine";

const MAX_FILE_SIZE = 25 * 1024 * 1024;

function currency(value: number) {
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function totalCost(value: { pgFee: number; systemNovaFee: number; additionalServiceFee: number }) {
  return value.pgFee + value.systemNovaFee + value.additionalServiceFee;
}

function Metric({ label, value, description }: { label: string; value: number; description?: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-2 text-2xl font-semibold tabular-nums">{currency(value)}</p>
        {description ? <p className="mt-1 text-xs text-muted-foreground">{description}</p> : null}
      </CardContent>
    </Card>
  );
}

export function NovaSettlementValidator() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [analysis, setAnalysis] = useState<MonthlyAnalysis | null>(null);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function validateFile(file: File | undefined) {
    if (!file) return;
    setError("");
    setAnalysis(null);
    setFileName(file.name);

    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      setError("노바 정산서는 .xlsx 파일만 검증할 수 있습니다.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError("파일 크기는 25 MiB 이하여야 합니다.");
      return;
    }

    setBusy(true);
    try {
      const { default: readXlsxFile } = await import("read-excel-file/browser");
      const sheets = (await readXlsxFile(file)) as unknown as WorkbookInput["sheets"];
      setAnalysis(analyzeWorkbook({
        fileName: file.name,
        fileSize: file.size,
        lastModified: file.lastModified,
        inputOrder: 0,
        sheets,
      }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "정산서를 읽거나 검증하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setAnalysis(null);
    setFileName("");
    setError("");
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-teal-600 hover:bg-teal-600"><ShieldCheck /> 숫자 자동 검증</Badge>
            <Badge variant="outline">엔진 {SETTLEMENT_ENGINE_VERSION}</Badge>
          </div>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight">노바 정산서 검증하기</h1>
          <p className="mt-2 max-w-3xl leading-7 text-muted-foreground">
            노바에서 받은 정산 엑셀을 올리면 원본 거래를 다시 계산해 강사별
            매출·비용과 전체 요약 금액이 맞는지 확인합니다.
          </p>
        </div>
        {analysis || error ? <Button variant="outline" onClick={reset}><RotateCcw /> 다른 파일 검증</Button> : null}
      </section>

      <Card className="border-dashed border-teal-500/50 bg-teal-500/5">
        <CardContent className="flex flex-col items-center px-6 py-10 text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-teal-600 text-white shadow-sm">
            {busy ? <Loader2 className="size-6 animate-spin" /> : <UploadCloud className="size-6" />}
          </span>
          <h2 className="mt-4 text-lg font-semibold">
            {busy ? "정산서의 모든 시트를 계산하고 있습니다" : "노바 정산 엑셀 선택"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            .xlsx · 최대 25 MiB · 파일은 브라우저에서만 처리되며 서버에 저장하지 않습니다.
          </p>
          <Input
            ref={inputRef}
            id="nova-settlement-file"
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            disabled={busy}
            onChange={(event) => void validateFile(event.currentTarget.files?.[0])}
          />
          <Button className="mt-5 bg-teal-600 text-white hover:bg-teal-700" disabled={busy} onClick={() => inputRef.current?.click()}>
            <FileSpreadsheet /> {fileName || "엑셀 파일 찾기"}
          </Button>
        </CardContent>
      </Card>

      {error ? <Alert variant="destructive"><XCircle /><AlertTitle>검증할 수 없습니다</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}

      {analysis ? (
        <>
          <Alert variant={analysis.allMatched ? "default" : "destructive"}>
            {analysis.allMatched ? <CheckCircle2 /> : <AlertTriangle />}
            <AlertTitle>{analysis.allMatched ? "정산서의 전체 숫자가 모두 일치합니다" : "정산서에서 일치하지 않는 숫자를 찾았습니다"}</AlertTitle>
            <AlertDescription>
              {analysis.fileName} · {analysis.periodLabel} · 전체 요약 8개 중 {analysis.comparisons.filter((item) => item.matches).length}개 일치
              {!analysis.hasCashSheet ? " · 무통장 시트가 없어 현금 매출은 0원으로 계산했습니다." : ""}
            </AlertDescription>
          </Alert>

          <section className="space-y-4" aria-labelledby="nova-total-heading">
            <div>
              <h2 id="nova-total-heading" className="text-xl font-semibold">전체 매출·비용 정산</h2>
              <p className="mt-1 text-sm text-muted-foreground">모든 강사의 거래 명세를 다시 합산한 금액입니다.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Metric label="전체 매출" value={analysis.totals.totalSales} />
              <Metric label="전체 비용·수수료" value={totalCost(analysis.totals)} description="PG + 시스템노바 + 부가서비스" />
              <Metric label="PG·노바 수수료" value={analysis.totals.pgFee + analysis.totals.systemNovaFee} />
              <Metric label="최종 정산액" value={analysis.totals.finalSettlement} description="비즈업 정산금 + 현금 매출" />
            </div>
          </section>

          <Card>
            <CardHeader>
              <CardTitle>강사별 매출·비용</CardTitle>
              <CardDescription>토스·무통장·부가서비스 시트의 강사명을 기준으로 묶었습니다.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>강사</TableHead><TableHead className="text-right">매출</TableHead><TableHead className="text-right">PG 수수료</TableHead><TableHead className="text-right">노바 수수료</TableHead><TableHead className="text-right">부가서비스</TableHead><TableHead className="text-right">총 비용</TableHead><TableHead className="text-right">최종 정산액</TableHead><TableHead className="text-right">거래</TableHead></TableRow></TableHeader>
                <TableBody>
                  {analysis.instructorResults.map((item) => (
                    <TableRow key={item.instructor}>
                      <TableCell className="font-medium">{item.instructor}</TableCell>
                      <TableCell className="text-right tabular-nums">{currency(item.totalSales)}</TableCell>
                      <TableCell className="text-right tabular-nums">{currency(item.pgFee)}</TableCell>
                      <TableCell className="text-right tabular-nums">{currency(item.systemNovaFee)}</TableCell>
                      <TableCell className="text-right tabular-nums">{currency(item.additionalServiceFee)}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{currency(totalCost(item))}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{currency(item.finalSettlement)}</TableCell>
                      <TableCell className="text-right tabular-nums">{(item.tossMatchCount + item.cashMatchCount).toLocaleString("ko-KR")}건</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/50">
                    <TableCell className="font-semibold">전체</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{currency(analysis.totals.totalSales)}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{currency(analysis.totals.pgFee)}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{currency(analysis.totals.systemNovaFee)}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{currency(analysis.totals.additionalServiceFee)}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{currency(totalCost(analysis.totals))}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{currency(analysis.totals.finalSettlement)}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{(analysis.totals.tossMatchCount + analysis.totals.cashMatchCount).toLocaleString("ko-KR")}건</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>전체 요약 숫자 검증</CardTitle>
              <CardDescription>요약 시트의 기재 금액과 거래 시트에서 다시 계산한 금액을 비교합니다.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>항목</TableHead><TableHead className="text-right">엑셀 요약</TableHead><TableHead className="text-right">재계산</TableHead><TableHead className="text-right">차이</TableHead><TableHead className="text-center">결과</TableHead></TableRow></TableHeader>
                <TableBody>
                  {analysis.comparisons.map((item) => (
                    <TableRow key={item.key}>
                      <TableCell className="font-medium">{item.label}</TableCell>
                      <TableCell className="text-right tabular-nums">{item.summaryValue == null ? "값 없음" : currency(item.summaryValue)}</TableCell>
                      <TableCell className="text-right tabular-nums">{currency(item.calculatedValue)}</TableCell>
                      <TableCell className="text-right tabular-nums">{item.difference == null ? "-" : currency(item.difference)}</TableCell>
                      <TableCell className="text-center"><Badge variant={item.matches ? "outline" : "destructive"}>{item.matches ? <CheckCircle2 /> : <XCircle />}{item.matches ? "일치" : "확인 필요"}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
