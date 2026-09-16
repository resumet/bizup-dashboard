"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MoreHorizontal, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatOrderStudentPhone, normalizeOrderStudentPhone, summarizeOrderStudents, type OrderStudent } from "@/lib/course-orders/student-roster";
import { CourseRosterShareDialog } from "./course-roster-share-dialog";
import { PaymentIdButton } from "@/components/jobs/payment-id-button";

const PAGE_SIZE = 50;
const money = (value: number) => `${value.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}원`;
const percent = (value: number | null) => value === null ? "—" : `${value.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}%`;

export function CourseOrderStudentRoster({ courseId, students, onDelete, onRestore, onSaved }: { courseId: string; students: OrderStudent[]; onDelete: (orderId: string) => void; onRestore: (orderId: string) => void; onSaved?: () => void }) {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [option, setOption] = useState<string | null>(null);
  const [deleted, setDeleted] = useState<OrderStudent | null>(null);
  const [preparing, setPreparing] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const summary = useMemo(() => summarizeOrderStudents(students), [students]);
  const filtered = students.filter((student) => option === null || student.optionName === option);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  async function saveRoster() {
    setSaving(true); setError(""); setSaved(false);
    try {
      const response = await fetch(`/api/course-operations/${courseId}/paid-students`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderIds: students.map((student) => student.orderId) }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message ?? "명단을 저장하지 못했습니다.");
      setSaved(true);
      router.refresh();
      onSaved?.();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "명단을 저장하지 못했습니다."); }
    finally { setSaving(false); }
  }

  async function openMessage(student: OrderStudent) {
    if (preparing) return;
    setPreparing(student.orderId); setError("");
    try {
      const response = await fetch(`/api/course-operations/${courseId}/orders/${student.orderId}/message-contact`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message ?? "발송 대상을 준비하지 못했습니다.");
      router.push(`/services/message-automation?bookId=${encodeURIComponent(body.bookId)}&contactId=${encodeURIComponent(body.contactId)}&courseId=${encodeURIComponent(courseId)}`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "발송 화면을 열지 못했습니다."); }
    finally { setPreparing(null); }
  }

  return <section aria-label="결제완료 수강생 명단">
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>결제완료 수강생 명단</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={saving || !students.length} onClick={() => void saveRoster()}>{saving && <Loader2 className="animate-spin" />}{saving ? "저장 중" : "유료수강생 명단에 저장하기"}</Button>
            <CourseRosterShareDialog courseId={courseId} />
          </div>
        </div>
        <CardDescription>결제완료 {summary.count.toLocaleString("ko-KR")}건 · 수강생 {summary.people.toLocaleString("ko-KR")}명 · 전체 매출 {money(summary.amount)}</CardDescription>
        <p className="text-xs text-muted-foreground">인원은 전화번호(없으면 이메일) 기준으로 중복을 제외합니다. 여러 옵션을 구매한 사람은 각 옵션에 포함됩니다. 매출은 현재 명단의 결제금액 합계입니다.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">저장하기를 누르면 옵션 필터와 관계없이 이 명단 전체가 유료수강생 탭에 저장됩니다. 같은 주문은 갱신하고, 기존 수강생과 카톡방 참여 상태·비고는 유지합니다.</p>
        {saved && <p role="status" className="text-sm text-emerald-700">유료수강생 명단에 저장했습니다.</p>}
        <div className="overflow-x-auto rounded-md border" role="region" aria-label="옵션별 매출 통계">
          <Table><TableHeader><TableRow><TableHead>옵션명</TableHead><TableHead className="text-right">인원</TableHead><TableHead className="text-right">결제금액</TableHead><TableHead className="text-right">매출 기여도</TableHead></TableRow></TableHeader>
            <TableBody>{summary.options.map((item) => <TableRow key={item.optionName}>
              <TableCell>{item.optionName || "옵션 없음"}</TableCell><TableCell className="text-right">{item.people.toLocaleString("ko-KR")}명</TableCell><TableCell className="text-right tabular-nums">{money(item.amount)}</TableCell><TableCell className="text-right tabular-nums">{percent(item.contribution)}</TableCell>
            </TableRow>)}{!summary.options.length && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">집계할 결제완료 주문이 없습니다.</TableCell></TableRow>}</TableBody>
          </Table>
        </div>
        <label className="flex flex-wrap items-center gap-3 text-sm">옵션별 필터
          <select aria-label="수강생 옵션 필터" className="h-10 max-w-full rounded-md border bg-background px-3" value={option === null ? "" : JSON.stringify(option)} onChange={(event) => { setOption(event.target.value === "" ? null : JSON.parse(event.target.value)); setPage(1); }}>
            <option value="">전체 옵션</option>
            {summary.options.map((item) => <option key={item.optionName} value={JSON.stringify(item.optionName)}>{item.optionName || "옵션 없음"} · {item.people}명 · {money(item.amount)}</option>)}
            {option !== null && !summary.options.some((item) => item.optionName === option) && <option value={JSON.stringify(option)}>{option || "옵션 없음"} · 0명</option>}
          </select>
          <span className="text-muted-foreground">조회 {filtered.length.toLocaleString("ko-KR")}건</span>
        </label>
        {deleted && <div role="status" className="flex flex-wrap items-center gap-2 rounded-md bg-muted p-3 text-sm">{deleted.name || "이름 없음"} 항목을 이 명단에서 삭제했습니다. 원본 주문은 유지됩니다.<Button type="button" size="sm" variant="outline" onClick={() => { onRestore(deleted.orderId); setDeleted(null); }}>되돌리기</Button></div>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="overflow-x-auto rounded-md border">
          <Table aria-label="수강생 상세 명단">
            <TableHeader><TableRow>
              <TableHead>번호</TableHead><TableHead>이름</TableHead><TableHead>전화번호</TableHead><TableHead>이메일</TableHead><TableHead>옵션명</TableHead><TableHead>결제방법</TableHead><TableHead>RS</TableHead><TableHead>결제ID</TableHead><TableHead className="text-right">금액</TableHead><TableHead><span className="sr-only">작업</span></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {visible.map((student, index) => <TableRow key={student.orderId}>
                <TableCell className="tabular-nums">{(currentPage - 1) * PAGE_SIZE + index + 1}</TableCell>
                <TableCell className="font-medium">{student.name || "—"}</TableCell>
                <TableCell>{formatOrderStudentPhone(student.phone)}</TableCell>
                <TableCell>{student.email || "—"}</TableCell>
                <TableCell className="min-w-40 max-w-80 whitespace-normal break-words">{student.optionName || "—"}</TableCell>
                <TableCell>{student.paymentMethod || "—"}</TableCell><TableCell>{student.rs || "—"}</TableCell><TableCell><PaymentIdButton value={student.paymentId} name={student.name} /></TableCell>
                <TableCell className="text-right tabular-nums">{money(student.amount)}</TableCell>
                <TableCell><DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon" aria-label={`${student.name || "이름 없음"} 메뉴`} disabled={Boolean(preparing)}>{preparing === student.orderId ? <Loader2 className="animate-spin" /> : <MoreHorizontal />}</Button></DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem variant="destructive" onSelect={() => { onDelete(student.orderId); setDeleted(student); }}><Trash2 />삭제</DropdownMenuItem>
                    <DropdownMenuItem disabled={!normalizeOrderStudentPhone(student.phone)} onSelect={() => void openMessage(student)}><Send />메시지보내기</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu></TableCell>
              </TableRow>)}
              {!filtered.length && <TableRow><TableCell colSpan={10} className="h-24 text-center text-muted-foreground">{students.length ? "선택한 옵션의 수강생이 없습니다." : "결제완료인 주문이 없습니다."}</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
        {pageCount > 1 && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
          <span>{currentPage} / {pageCount}페이지 · 페이지당 {PAGE_SIZE}건</span>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>이전</Button>
            <Button type="button" variant="outline" size="sm" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>다음</Button>
          </div>
        </div>}
      </CardContent>
    </Card>
  </section>;
}
