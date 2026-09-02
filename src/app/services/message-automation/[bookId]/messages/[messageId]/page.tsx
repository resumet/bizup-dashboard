import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Layers3,
  MessageSquareText,
  XCircle,
} from "lucide-react";

import { DeliveryStatusRefresher } from "@/components/messages/delivery-status-refresher";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatPhone } from "@/lib/jobs/filter";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

type PageProps = {
  params: Promise<{ bookId: string; messageId: string }>;
  searchParams: Promise<{ page?: string }>;
};

const RECIPIENTS_PER_PAGE = 200;

type RecipientRow = {
  id: string;
  recipient_name: string | null;
  normalized_phone: string;
  status: string;
  http_status: number | null;
  shoong_code: string | null;
  provider_status: string | null;
  provider_result_code: string | null;
  provider_result_message: string | null;
  final_message_type: string | null;
  failure_reason: string | null;
  requested_at: string | null;
  delivery_checked_at: string | null;
};

async function loadRecipientPage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  messageId: string,
  page: number,
) {
  const start = (page - 1) * RECIPIENTS_PER_PAGE;
  const { data, error, count } = await supabase
    .from("address_book_message_recipients")
    .select(
      "id,recipient_name,normalized_phone,status,http_status,shoong_code,provider_status,provider_result_code,provider_result_message,final_message_type,failure_reason,requested_at,delivery_checked_at",
      { count: "exact" },
    )
    .eq("message_job_id", messageId)
    .order("requested_at", { ascending: true })
    .order("provider_seq", { ascending: true, nullsFirst: false })
    .range(start, start + RECIPIENTS_PER_PAGE - 1);
  if (error) throw new Error(`수신자 발송 결과 조회 실패: ${error.code}`);
  return { recipients: (data ?? []) as RecipientRow[], totalCount: count ?? 0 };
}

export default async function AddressMessageHistoryDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { bookId, messageId } = await params;
  const query = await searchParams;
  const parsedPage = Number.parseInt(query.page ?? "1", 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) redirect("/login");

  const [{ data: book }, { data: message }] = await Promise.all([
    supabase.from("address_books").select("id,name").eq("id", bookId).maybeSingle(),
    supabase
      .from("address_book_message_jobs")
      .select(
        "id,template_code,target_scope,requested_count,success_count,failed_count,status,provider,delivery_checked_at,created_at,message_templates(name)",
      )
      .eq("id", messageId)
      .eq("address_book_id", bookId)
      .maybeSingle(),
  ]);
  if (!book || !message) notFound();

  const [recipientResult, { data: batches, error: batchError }] = await Promise.all([
    loadRecipientPage(supabase, message.id, page),
    supabase
      .from("message_provider_batches")
      .select(
        "id,chunk_index,recipient_count,success_count,failed_count,status,http_status,provider_status,group_id,provider_correlation_id,failure_reason,submitted_at,delivery_checked_at",
      )
      .eq("address_book_message_job_id", message.id)
      .order("chunk_index"),
  ]);
  if (batchError) throw new Error(`발송 배치 조회 실패: ${batchError.code}`);
  const { recipients, totalCount } = recipientResult;
  const pageCount = Math.max(1, Math.ceil(totalCount / RECIPIENTS_PER_PAGE));
  if (page > pageCount) {
    redirect(
      `/services/message-automation/${bookId}/messages/${messageId}?page=${pageCount}`,
    );
  }
  const template = Array.isArray(message.message_templates)
    ? message.message_templates[0]
    : message.message_templates;
  const pendingCount = Math.max(
    0,
    message.requested_count - message.success_count - message.failed_count,
  );

  return (
    <main className="min-h-screen">
      {message.provider === "directalk" &&
      (message.status === "processing" || !message.delivery_checked_at) ? (
        <DeliveryStatusRefresher
          endpoints={[
            `/api/address-books/${bookId}/messages/${messageId}/sync`,
          ]}
        />
      ) : null}
      <header className="border-b">
        <div className="mx-auto flex h-18 max-w-[1600px] items-center px-5 lg:px-8">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/services/message-automation/history">
              <ArrowLeft />
              발송 이력
            </Link>
          </Button>
          <div className="mx-3 h-5 w-px bg-border" />
          <span className="truncate font-semibold">발송 이력 상세</span>
        </div>
      </header>

      <div className="mx-auto max-w-[1600px] px-5 py-8 lg:px-8">
        <Badge variant="outline" className="mb-3">
          {scopeLabel(message.target_scope)}
        </Badge>
        <h1 className="text-3xl font-semibold">
          {template?.name ?? message.template_code}
        </h1>
        <p className="mt-2 text-muted-foreground">
          {book.name} · {formatDateTime(message.created_at)}
        </p>

        <div className="mt-7 grid gap-4 sm:grid-cols-4">
          <Metric title="발송 대상" value={message.requested_count} icon={<MessageSquareText />} />
          <Metric title="성공" value={message.success_count} icon={<CheckCircle2 className="text-emerald-600" />} />
          <Metric title="실패" value={message.failed_count} icon={<XCircle className="text-destructive" />} />
          <Metric title="확인 중" value={pendingCount} icon={<Clock3 />} />
        </div>

        {(batches ?? []).length > 0 ? (
          <Card className="mt-5 overflow-hidden">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Layers3 className="size-4" />
                DirecTalk 발송 배치
              </CardTitle>
            </CardHeader>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>배치</TableHead>
                    <TableHead className="text-right">대상</TableHead>
                    <TableHead className="text-right">성공</TableHead>
                    <TableHead className="text-right">실패</TableHead>
                    <TableHead>상태</TableHead>
                    <TableHead>공급자 상태</TableHead>
                    <TableHead>접수 응답</TableHead>
                    <TableHead>확인 시간</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(batches ?? []).map((batch) => (
                    <TableRow key={batch.id}>
                      <TableCell>#{batch.chunk_index + 1}</TableCell>
                      <TableCell className="text-right">{batch.recipient_count}</TableCell>
                      <TableCell className="text-right text-emerald-600">{batch.success_count}</TableCell>
                      <TableCell className="text-right text-destructive">{batch.failed_count}</TableCell>
                      <TableCell><StatusBadge status={batch.status} /></TableCell>
                      <TableCell className="font-mono text-xs">{batch.provider_status ?? "-"}</TableCell>
                      <TableCell className="font-mono text-xs">{batch.http_status ? `HTTP ${batch.http_status}` : "-"}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">{batch.delivery_checked_at ? formatDateTime(batch.delivery_checked_at) : "확인 중"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        ) : null}

        <Card className="mt-5 overflow-hidden">
          <CardHeader>
            <CardTitle className="text-base">수신자별 실제 발송 결과</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>수신자</TableHead>
                  <TableHead>연락처</TableHead>
                  <TableHead>실제 결과</TableHead>
                  <TableHead>공급자 상태</TableHead>
                  <TableHead>최종 채널</TableHead>
                  <TableHead>응답 코드</TableHead>
                  <TableHead>실패 사유</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recipients.map((recipient) => (
                  <TableRow key={recipient.id}>
                    <TableCell className="font-medium">{recipient.recipient_name || "-"}</TableCell>
                    <TableCell className="font-mono">{formatPhone(recipient.normalized_phone)}</TableCell>
                    <TableCell><StatusBadge status={recipient.status} /></TableCell>
                    <TableCell className="font-mono text-xs">{recipient.provider_status || "-"}</TableCell>
                    <TableCell>{finalMessageTypeLabel(recipient.final_message_type)}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {[
                        recipient.http_status && `HTTP ${recipient.http_status}`,
                        recipient.provider_result_code || recipient.shoong_code,
                      ].filter(Boolean).join(" / ") || "-"}
                    </TableCell>
                    <TableCell className="max-w-md text-muted-foreground">
                      {recipient.failure_reason || recipient.provider_result_message || "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
            <span className="text-muted-foreground">
              {page.toLocaleString("ko-KR")} / {pageCount.toLocaleString("ko-KR")} 페이지
            </span>
            <div className="flex gap-2">
              {page > 1 ? (
                <Button variant="outline" size="sm" asChild>
                  <Link href={`?page=${page - 1}`}>이전</Link>
                </Button>
              ) : (
                <Button variant="outline" size="sm" disabled>이전</Button>
              )}
              {page < pageCount ? (
                <Button variant="outline" size="sm" asChild>
                  <Link href={`?page=${page + 1}`}>다음</Link>
                </Button>
              ) : (
                <Button variant="outline" size="sm" disabled>다음</Button>
              )}
            </div>
          </div>
        </Card>
      </div>
    </main>
  );
}

function Metric({ title, value, icon }: { title: string; value: number; icon: React.ReactNode }) {
  return <Card><CardContent className="pt-6"><div className="flex items-center justify-between text-sm text-muted-foreground"><span>{title}</span><span className="[&>svg]:size-4">{icon}</span></div><strong className="mt-1 block text-2xl">{value.toLocaleString("ko-KR")}명</strong></CardContent></Card>;
}
function StatusBadge({ status }: { status: string }) {
  if (status === "success" || status === "completed") return <Badge><CheckCircle2 />성공</Badge>;
  if (status === "failed") return <Badge variant="destructive"><XCircle />실패</Badge>;
  if (status === "partial_failed") return <Badge variant="destructive">일부 실패</Badge>;
  return <Badge variant="secondary"><Clock3 />확인 중</Badge>;
}
function scopeLabel(scope: string) {
  if (scope === "test") return "테스트 발송";
  if (scope === "selected") return "선택 수신자";
  if (scope === "filtered") return "필터 결과";
  return "전체 수신자";
}
function finalMessageTypeLabel(value: string | null) {
  if (value === "AT") return "알림톡";
  if (value === "SM") return "SMS";
  if (value === "LM") return "LMS";
  return value || "-";
}
function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}
