"use client";

import { useMemo, useState } from "react";
import readXlsxFile from "read-excel-file/browser";
import {
  ChartNoAxesCombined,
  FileSpreadsheet,
  Repeat2,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  analyzePurchaseOrders,
  parsePurchaseOrderRows,
  type PurchaseGroup,
  type PurchaseOrderRow,
} from "@/lib/purchases/analysis";

const ALL = "__all__";

function currency(value: number) {
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function MetricCard({
  title,
  value,
  detail,
}: {
  title: string;
  value: string;
  detail?: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-sm text-muted-foreground">{title}</p>
        <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
        {detail ? <p className="mt-1 text-xs text-muted-foreground">{detail}</p> : null}
      </CardContent>
    </Card>
  );
}

function RevenueTrend({ items }: { items: PurchaseGroup[] }) {
  const width = 960;
  const height = 280;
  const padding = 30;
  const max = Math.max(...items.map((item) => item.currentAmount), 1);
  const points = items.map((item, index) => ({
    ...item,
    x: items.length === 1
      ? width / 2
      : padding + (index / (items.length - 1)) * (width - padding * 2),
    y: height - padding - (item.currentAmount / max) * (height - padding * 2),
  }));
  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="min-w-[760px]"
        role="img"
        aria-label="결제일별 순매출 추이"
      >
        <line
          x1={padding}
          y1={height - padding}
          x2={width - padding}
          y2={height - padding}
          className="stroke-border"
        />
        <polyline
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          className="text-primary"
          points={points.map((point) => `${point.x},${point.y}`).join(" ")}
        />
        {points.map((point) => (
          <circle
            key={point.name}
            cx={point.x}
            cy={point.y}
            r="5"
            fill="currentColor"
            className="text-primary"
          >
            <title>
              {point.name} · 순매출 {currency(point.currentAmount)} · 주문 {point.count.toLocaleString("ko-KR")}건 · 환불 {currency(point.refundAmount)}
            </title>
          </circle>
        ))}
      </svg>
      <div className="mt-2 flex justify-between text-xs text-muted-foreground">
        <span>{items[0]?.name ?? "-"}</span>
        <span>{items.at(-1)?.name ?? "-"}</span>
      </div>
    </div>
  );
}

function GroupTable({ title, items }: { title: string; items: PurchaseGroup[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>이름</TableHead>
              <TableHead className="text-right">주문</TableHead>
              <TableHead className="text-right">결제금액</TableHead>
              <TableHead className="text-right">환불금액</TableHead>
              <TableHead className="text-right">순매출</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.name}>
                <TableCell className="min-w-56 font-medium">{item.name}</TableCell>
                <TableCell className="text-right tabular-nums">{item.count.toLocaleString("ko-KR")}</TableCell>
                <TableCell className="text-right tabular-nums">{currency(item.paymentAmount)}</TableCell>
                <TableCell className="text-right tabular-nums text-destructive">{currency(item.refundAmount)}</TableCell>
                <TableCell className="text-right font-medium tabular-nums">{currency(item.currentAmount)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export function PurchaseAnalysisDashboard() {
  const [rows, setRows] = useState<PurchaseOrderRow[]>([]);
  const [filename, setFilename] = useState("");
  const [error, setError] = useState("");
  const [course, setCourse] = useState(ALL);
  const [adMedia, setAdMedia] = useState(ALL);

  const choices = useMemo(() => ({
    courses: [...new Set(rows.map((row) => row.courseName))].toSorted(),
    adMedia: [...new Set(rows.map((row) => row.adMedia))].toSorted(),
  }), [rows]);
  const filteredRows = useMemo(() => rows.filter((row) =>
    (course === ALL || row.courseName === course) &&
    (adMedia === ALL || row.adMedia === adMedia)
  ), [rows, course, adMedia]);
  const analysis = useMemo(
    () => filteredRows.length ? analyzePurchaseOrders(filteredRows) : null,
    [filteredRows],
  );

  async function handleFile(file?: File) {
    if (!file) return;
    setError("");
    try {
      const sheets = await readXlsxFile(file);
      const target =
        sheets.find((sheet) => sheet.sheet === "주문결제 목록") ?? sheets[0];
      if (!target) throw new Error("엑셀 시트를 찾을 수 없습니다.");
      const parsed = parsePurchaseOrderRows(target.data as unknown[][]);
      setRows(parsed);
      setFilename(file.name);
      setCourse(ALL);
      setAdMedia(ALL);
    } catch (cause) {
      setRows([]);
      setFilename("");
      setError(cause instanceof Error ? cause.message : "엑셀을 분석하지 못했습니다.");
    }
  }

  if (!analysis) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex min-h-80 flex-col items-center justify-center p-8 text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
            <FileSpreadsheet />
          </span>
          <h2 className="mt-5 text-xl font-semibold">주문결제 엑셀을 선택하세요</h2>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            주문항목·결제·환불·광고 유입을 분석합니다. 테스트 강의는 자동으로 제외하고 분할결제는 주문번호 기준 한 건으로 집계합니다.
          </p>
          <Button className="relative mt-6 overflow-hidden" size="lg">
            <FileSpreadsheet /> 엑셀 불러오기
            <input
              type="file"
              accept=".xlsx,.xls"
              className="absolute inset-0 cursor-pointer opacity-0"
              aria-label="주문결제 엑셀 불러오기"
              onChange={(event) => void handleFile(event.target.files?.[0])}
            />
          </Button>
          {error ? (
            <Alert variant="destructive" className="mt-6 max-w-2xl text-left">
              <AlertTitle>파일을 처리할 수 없습니다</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  const totals = analysis.totals;
  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 p-5">
          <div className="mr-auto">
            <p className="text-sm font-medium">{filename}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {rows.length.toLocaleString("ko-KR")}개 결제 행 · 필터 결과 {filteredRows.length.toLocaleString("ko-KR")}개
            </p>
          </div>
          {([
            ["강의", course, setCourse, choices.courses],
            ["광고매체", adMedia, setAdMedia, choices.adMedia],
          ] as const).map(([label, value, setter, items]) => (
            <div key={label} className="min-w-48 space-y-1.5">
              <Label>{label}</Label>
              <Select value={value} onValueChange={setter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>전체</SelectItem>
                  {items.map((item) => <SelectItem key={item} value={item}>{item === "-" ? "미분류" : item}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ))}
          <Button variant="outline" className="relative overflow-hidden">
            파일 교체
            <input
              type="file"
              accept=".xlsx,.xls"
              className="absolute inset-0 cursor-pointer opacity-0"
              aria-label="주문결제 엑셀 교체"
              onChange={(event) => void handleFile(event.target.files?.[0])}
            />
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <MetricCard title="총 결제금액" value={currency(totals.paymentAmount)} />
        <MetricCard title="환불금액" value={currency(totals.refundAmount)} detail={`환불률 ${totals.refundRate.toFixed(1)}%`} />
        <MetricCard title="순매출" value={currency(totals.currentAmount)} />
        <MetricCard title="고유 주문" value={`${totals.orderCount.toLocaleString("ko-KR")}건`} detail={`유효 ${totals.activeOrderCount.toLocaleString("ko-KR")}건`} />
        <MetricCard title="순매출 객단가" value={currency(totals.averageOrderValue)} />
        <MetricCard title="고유 구매자" value={`${totals.customerCount.toLocaleString("ko-KR")}명`} detail={`재구매 ${analysis.repeatCustomers.length.toLocaleString("ko-KR")}명`} />
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><ChartNoAxesCombined /> 일별 순매출 추이</CardTitle></CardHeader>
        <CardContent><RevenueTrend items={analysis.trend} /></CardContent>
      </Card>

      <GroupTable title="강의별 매출" items={analysis.courses} />
      <div className="grid gap-6 xl:grid-cols-2">
        <GroupTable title="광고매체별 매출" items={analysis.adMedia} />
        <GroupTable title="유입경로별 매출" items={analysis.inflowTypes} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Repeat2 /> 중복 구매자 <Badge variant="secondary">{analysis.repeatCustomers.length.toLocaleString("ko-KR")}명</Badge></CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>회원명</TableHead><TableHead>이메일</TableHead><TableHead className="text-right">고유 주문</TableHead><TableHead className="text-right">순매출</TableHead><TableHead>구매 상품</TableHead></TableRow></TableHeader>
            <TableBody>
              {analysis.repeatCustomers.length ? analysis.repeatCustomers.map((customer) => (
                <TableRow key={`${customer.email}:${customer.phone}`}>
                  <TableCell className="font-medium">{customer.name || "이름 없음"}</TableCell>
                  <TableCell>{customer.email || "-"}</TableCell>
                  <TableCell className="text-right tabular-nums">{customer.purchaseCount.toLocaleString("ko-KR")}건</TableCell>
                  <TableCell className="text-right tabular-nums">{currency(customer.currentAmount)}</TableCell>
                  <TableCell className="min-w-72 text-sm text-muted-foreground">{customer.products.join(", ")}</TableCell>
                </TableRow>
              )) : <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">중복 구매자가 없습니다.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
