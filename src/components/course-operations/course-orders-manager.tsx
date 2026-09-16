"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, Upload, Users } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { filterCourseOrders, isAwaitingDeposit, summarizeCourseOrders } from "@/lib/course-orders/filter";
import { shortestSelectedCourseName } from "@/lib/course-orders/parse";
import { createOrderStudentRoster } from "@/lib/course-orders/student-roster";
import { CourseOrderStudentRoster } from "./course-order-student-roster";
import {
  EMPTY_ORDER_FILTERS, ORDER_CATEGORY_FILTERS,
  type CourseOrderFilters, type CourseOrderPreview, type CourseOrdersResponse,
  type SavedCourseOrder,
} from "@/lib/course-orders/types";

const money = (value: number) => `${value.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}원`;
const PAGE_SIZE = 50;
const COLUMNS: Array<{ key: keyof SavedCourseOrder; label: string; money?: boolean }> = [
  { key: "productName", label: "주문항목명" }, { key: "optionName", label: "옵션명" },
  { key: "memberName", label: "회원명" }, { key: "phone", label: "휴대전화번호" },
  { key: "email", label: "이메일" }, { key: "paymentAmount", label: "결제금액", money: true },
  { key: "refundAmount", label: "환불금액", money: true }, { key: "currentAmount", label: "현 결제금액", money: true },
  { key: "status", label: "주문상태" }, { key: "paymentMethod", label: "결제방법" },
  { key: "rs", label: "RS" }, { key: "adMedia", label: "트래킹 광고 매체" },
  { key: "inflowType", label: "트래킹 유입 구분" }, { key: "paymentId", label: "결제ID" },
  { key: "refundDate", label: "환불일" },
];
const SELECT_CLASS = "h-10 w-full min-w-0 rounded-md border bg-background px-3 text-sm";

async function responseData<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message ?? "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  if (!data) throw new Error("서버 응답을 읽지 못했습니다.");
  return data as T;
}

export function CourseOrdersManager({ courseId, courseName, onCourseNameChange, onRosterSaved }: { courseId: string; courseName: string; onCourseNameChange?: (name: string) => void; onRosterSaved?: () => void }) {
  const router = useRouter();
  const [data, setData] = useState<CourseOrdersResponse>({ orders: [], imports: [] });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<CourseOrderPreview | null>(null);
  const [products, setProducts] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [filters, setFilters] = useState<CourseOrderFilters>(EMPTY_ORDER_FILTERS);
  const [orderView, setOrderView] = useState<"all" | "awaitingDeposit">("all");
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [rosterCourseId, setRosterCourseId] = useState<string | null>(null);
  const [excludedOrderIds, setExcludedOrderIds] = useState<Set<string>>(new Set());
  const endpoint = `/api/course-operations/${courseId}/orders`;

  useEffect(() => {
    const controller = new AbortController();
    fetch(endpoint, { cache: "no-store", signal: controller.signal })
      .then(responseData<CourseOrdersResponse>)
      .then((result) => { setData(result); setLoadError(""); })
      .catch((reason: unknown) => { if (!controller.signal.aborted) setLoadError(reason instanceof Error ? reason.message : "주문 내역을 불러오지 못했습니다."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [endpoint, reload]);

  const awaitingDeposit = useMemo(() => data.orders.filter(isAwaitingDeposit), [data.orders]);
  const scopedOrders = orderView === "awaitingDeposit" ? awaitingDeposit : data.orders;
  const filtered = useMemo(() => filterCourseOrders(scopedOrders, filters), [scopedOrders, filters]);
  const students = useMemo(() => createOrderStudentRoster(data.orders).filter((student) => !excludedOrderIds.has(student.orderId)), [data.orders, excludedOrderIds]);
  const totals = useMemo(() => summarizeCourseOrders(filtered), [filtered]);
  const choices = useMemo(() => Object.fromEntries(ORDER_CATEGORY_FILTERS.map(([key]) =>
    [key, [...new Set(scopedOrders.map((row) => row[key]))].sort((a, b) => a.localeCompare(b, "ko-KR"))],
  )), [scopedOrders]);
  const selectedCount = preview?.products.reduce((sum, product) => sum + (products.has(product.name) ? product.count : 0), 0) ?? 0;
  const selectedCourseName = shortestSelectedCourseName(products);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function changeFilters(next: CourseOrderFilters) { setFilters(next); setPage(1); }
  function refresh() { setLoading(true); setReload((value) => value + 1); }

  async function previewFile() {
    if (!file) return;
    setBusy(true); setError(""); setNotice(""); setPreview(null);
    try {
      const body = new FormData(); body.set("file", file);
      const result = await responseData<CourseOrderPreview>(await fetch(`${endpoint}/preview`, { method: "POST", body }));
      setPreview(result);
      setProducts(new Set(result.products.filter((product) => product.suggested).map((product) => product.name)));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "엑셀을 분석하지 못했습니다."); }
    finally { setBusy(false); }
  }

  async function save() {
    if (!file || !products.size) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const body = new FormData(); body.set("file", file); body.set("products", JSON.stringify([...products]));
      const result = await responseData<{ savedCount: number; courseName?: string; warning?: string }>(await fetch(endpoint, { method: "POST", body }));
      setNotice(`${result.savedCount.toLocaleString("ko-KR")}건을 저장했습니다.${result.courseName ? ` 강의명: ${result.courseName}.` : ""} 선택한 주문항목을 최신 명단으로 반영했습니다.`);
      if (result.warning) setError(result.warning);
      if (result.courseName) onCourseNameChange?.(result.courseName);
      router.refresh();
      setPreview(null); setProducts(new Set());
      changeFilters(EMPTY_ORDER_FILTERS); refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "주문 내역을 저장하지 못했습니다."); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader><CardTitle>주문 내역 가져오기</CardTitle>
          <p className="text-sm text-muted-foreground">주문결제 엑셀에서 {courseName}에 연결할 주문항목을 선택해 저장합니다.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-2">
              <Label htmlFor="course-order-file">주문결제 목록 (.xlsx, 최대 4MB)</Label>
              <Input id="course-order-file" type="file" accept=".xlsx" disabled={busy} onChange={(event) => {
                setFile(event.target.files?.[0] ?? null); setPreview(null); setProducts(new Set()); setError(""); setNotice("");
              }} />
            </div>
            <Button type="button" onClick={previewFile} disabled={!file || busy}>
              {busy ? <Loader2 className="animate-spin" /> : <Upload />}파일 분석
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">주문항목명 원문을 보관하고 마지막 ‘ - ’ 오른쪽을 옵션명으로 분류합니다. 분할결제는 같은 주문번호끼리 금액을 합산해 한 건으로 저장합니다. 선택한 주문항목이 이 강의의 최신 주문 전체로 반영되며, 새 파일에 없는 이전 주문은 정리됩니다.</p>
          {preview ? (
            <div className="space-y-3 rounded-lg border p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold">이 강의에 연결할 주문항목</h3>
                  <p className="text-sm text-muted-foreground">분할결제 통합 후 전체 {preview.totalCount.toLocaleString("ko-KR")}건 · 선택 {selectedCount.toLocaleString("ko-KR")}건</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => setProducts(products.size === preview.products.length ? new Set() : new Set(preview.products.map((product) => product.name)))} disabled={busy}>
                  {products.size === preview.products.length ? "전체 해제" : "전체 선택"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">강의명과 일치하는 항목을 우선 선택했습니다. 예약자용·신규 등 관련 항목을 확인해 추가하거나 해제하세요.</p>
              {selectedCourseName ? (
                <p className="rounded-md bg-muted p-3 text-sm">
                  저장할 강의명: <strong>{selectedCourseName}</strong>
                  <span className="mt-1 block text-xs text-muted-foreground">선택한 주문항목에서 옵션명을 제외한 가장 짧은 이름을 사용합니다. 저장 시 강의명에 반영됩니다.</span>
                </p>
              ) : null}
              <div className="max-h-80 space-y-2 overflow-y-auto">
                {preview.products.map((product) => (
                  <label key={product.name} className="flex cursor-pointer items-start gap-3 rounded-md border p-3">
                    <Checkbox className="mt-1" checked={products.has(product.name)} disabled={busy} onCheckedChange={(checked) => setProducts((current) => {
                      const next = new Set(current); if (checked === true) next.add(product.name); else next.delete(product.name); return next;
                    })} />
                    <span className="min-w-0 flex-1 break-words text-sm">{product.name}<span className="mt-1 block text-xs text-muted-foreground">옵션: {product.optionName || "옵션 없음"}{product.suggested ? " · 강의명 일치" : ""}</span></span>
                    <span className="shrink-0 text-sm tabular-nums">{product.count.toLocaleString("ko-KR")}건</span>
                  </label>
                ))}
              </div>
              <Button type="button" disabled={busy || !selectedCount || loading || Boolean(loadError)} onClick={save}>
                {busy ? <Loader2 className="animate-spin" /> : null}선택한 {selectedCount.toLocaleString("ko-KR")}건 저장
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
      {error ? <Alert variant="destructive"><AlertTitle>처리 실패</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
      {notice ? <Alert role="status"><AlertTitle>저장 완료</AlertTitle><AlertDescription>{notice}</AlertDescription></Alert> : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">저장된 주문 내역</h2>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" disabled={loading || busy || Boolean(loadError) || !data.orders.length} onClick={() => {
            setRosterCourseId(courseId);
            requestAnimationFrame(() => document.getElementById("course-order-student-roster")?.scrollIntoView({ behavior: "smooth", block: "start" }));
          }}><Users />수강생 명단 만들기</Button>
          <Button type="button" variant="outline" size="sm" onClick={refresh} disabled={loading || busy}><RefreshCw className={loading ? "animate-spin" : ""} />새로고침</Button>
        </div>
      </div>
      {loadError ? <Alert variant="destructive"><AlertTitle>주문 내역 조회 실패</AlertTitle><AlertDescription>{loadError}</AlertDescription></Alert> : null}
      {loading ? <p role="status" className="text-sm text-muted-foreground">주문 내역을 불러오는 중입니다.</p> : !loadError ? (
        <>
          <Tabs value={orderView} onValueChange={(value) => {
            setOrderView(value === "awaitingDeposit" ? "awaitingDeposit" : "all");
            changeFilters(EMPTY_ORDER_FILTERS);
          }}>
            <TabsList aria-label="주문 내역 보기" className="w-full sm:w-fit">
              <TabsTrigger value="all" className="px-4">전체 주문 ({data.orders.length.toLocaleString("ko-KR")})</TabsTrigger>
              <TabsTrigger value="awaitingDeposit" className="px-4">입금대기 ({awaitingDeposit.length.toLocaleString("ko-KR")})</TabsTrigger>
            </TabsList>
            <TabsContent value={orderView} className="space-y-5">
              {orderView === "awaitingDeposit" && <p className="text-sm text-muted-foreground">주문상태가 입금대기인 항목을 모아 보여줍니다. 분할결제 중 입금대기인 항목이 있는 주문도 포함합니다.</p>}
          <Card>
            <CardHeader><CardTitle className="text-base">주문 필터</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <Input aria-label="주문 검색" placeholder="회원명·연락처·이메일·주문항목·결제ID 등 검색" value={filters.keyword} onChange={(event) => changeFilters({ ...filters, keyword: event.target.value })} />
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {ORDER_CATEGORY_FILTERS.map(([key, label]) => (
                  <label key={key} className="space-y-1 text-sm"><span>{label}</span>
                    <select className={SELECT_CLASS} aria-label={`${label} 필터`} value={filters.categories[key] === undefined ? "" : JSON.stringify(filters.categories[key])} onChange={(event) => changeFilters({ ...filters, categories: { ...filters.categories, [key]: event.target.value === "" ? undefined : JSON.parse(event.target.value) as string } })}>
                      <option value="">전체</option>{choices[key].map((value: string) => <option key={value} value={JSON.stringify(value)}>{value || "미입력"}</option>)}
                    </select>
                  </label>
                ))}
                <label className="space-y-1 text-sm"><span>환불 여부</span>
                  <select className={SELECT_CLASS} value={filters.refund} onChange={(event) => changeFilters({ ...filters, refund: event.target.value as CourseOrderFilters["refund"] })}>
                    <option value="all">전체</option><option value="refunded">환불 있음</option><option value="notRefunded">환불 없음</option>
                  </select>
                </label>
              </div>
              <details className="rounded-md border p-3">
                <summary className="cursor-pointer text-sm font-medium">금액·환불일 상세 필터</summary>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {([
                    ["paymentMin", "paymentMax", "결제금액"], ["refundMin", "refundMax", "환불금액"], ["currentMin", "currentMax", "현 결제금액"],
                  ] as const).map(([min, max, label]) => (
                    <fieldset key={min} className="space-y-2"><legend className="text-sm">{label} (원)</legend>
                      <Input type="number" step="0.01" aria-label={`${label} 최소`} placeholder="최소" value={filters[min]} onChange={(event) => changeFilters({ ...filters, [min]: event.target.value })} />
                      <Input type="number" step="0.01" aria-label={`${label} 최대`} placeholder="최대" value={filters[max]} onChange={(event) => changeFilters({ ...filters, [max]: event.target.value })} />
                    </fieldset>
                  ))}
                  <fieldset className="space-y-2"><legend className="text-sm">환불일</legend>
                    <Input type="date" aria-label="환불일 시작" value={filters.refundFrom} onChange={(event) => changeFilters({ ...filters, refundFrom: event.target.value })} />
                    <Input type="date" aria-label="환불일 종료" value={filters.refundTo} onChange={(event) => changeFilters({ ...filters, refundTo: event.target.value })} />
                  </fieldset>
                </div>
              </details>
              <Button type="button" size="sm" variant="outline" onClick={() => changeFilters(EMPTY_ORDER_FILTERS)}>필터 초기화</Button>
            </CardContent>
          </Card>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              [orderView === "awaitingDeposit" ? "입금대기 주문항목" : "현재 필터 주문항목", `${totals.count.toLocaleString("ko-KR")}건 / ${orderView === "awaitingDeposit" ? "입금대기" : "전체"} ${scopedOrders.length.toLocaleString("ko-KR")}건`],
              ["결제금액 합계", money(totals.paymentAmount)], ["환불금액 합계", money(totals.refundAmount)], ["현 결제금액 합계", money(totals.currentAmount)],
            ].map(([label, value]) => <Card key={label}><CardContent><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-xl font-semibold tabular-nums">{value}</p></CardContent></Card>)}
          </div>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <Table aria-label={orderView === "awaitingDeposit" ? "입금대기 주문 내역" : "전체 주문 내역"}>
                <TableHeader><TableRow>{COLUMNS.map((column) => <TableHead key={column.key} className={column.money ? "text-right" : ""}>{column.label}</TableHead>)}</TableRow></TableHeader>
                <TableBody>{visible.map((row) => <TableRow key={row.id}>{COLUMNS.map((column) => <TableCell key={column.key} className={column.money ? "text-right tabular-nums" : column.key === "productName" ? "min-w-72 max-w-96 whitespace-normal" : ""}>{column.money ? money(Number(row[column.key])) : row[column.key] || "-"}</TableCell>)}</TableRow>)}</TableBody>
              </Table>
            </div>
            {!filtered.length ? <p className="p-10 text-center text-sm text-muted-foreground">{orderView === "awaitingDeposit" && !awaitingDeposit.length ? "입금대기인 주문이 없습니다. 입금대기 내역이 포함된 주문결제 엑셀을 가져오면 여기에 표시됩니다." : scopedOrders.length ? "조건에 맞는 주문이 없습니다." : "저장된 주문 내역이 없습니다. 위에서 주문결제 엑셀을 가져오세요."}</p> : null}
            <div className="flex items-center justify-between gap-3 border-t p-4 text-sm">
              <span>{currentPage} / {pageCount}페이지 · 페이지당 {PAGE_SIZE}건</span>
              <div className="flex gap-2"><Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>이전</Button><Button variant="outline" size="sm" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>다음</Button></div>
            </div>
          </Card>
            </TabsContent>
          </Tabs>
          {data.imports.length ? <Card><CardHeader><CardTitle className="text-base">최근 가져오기 이력</CardTitle></CardHeader><CardContent><ul className="space-y-2 text-sm">{data.imports.map((item) => <li key={item.id} className="flex flex-wrap justify-between gap-2"><span className="break-all">{item.fileName} · {item.rowCount.toLocaleString("ko-KR")}건</span><span className="text-muted-foreground">{new Date(item.createdAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</span></li>)}</ul></CardContent></Card> : null}
          {rosterCourseId === courseId && <div id="course-order-student-roster" className="scroll-mt-6"><CourseOrderStudentRoster key={courseId} courseId={courseId} students={students} onSaved={onRosterSaved} onDelete={(orderId) => setExcludedOrderIds((current) => new Set(current).add(orderId))} onRestore={(orderId) => setExcludedOrderIds((current) => { const next = new Set(current); next.delete(orderId); return next; })} /></div>}
        </>
      ) : null}
    </div>
  );
}
