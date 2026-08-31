import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CheckCircle2, Clock3, MessageSquareText, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatPhone } from "@/lib/jobs/filter";
import { MESSAGE_SCOPE_LABELS, MESSAGE_TEMPLATE_LABELS, type MessageHistoryItem } from "@/lib/messages/types";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

type PageProps = { params: Promise<{ jobId: string; messageId: string }> };
type RecipientDetail = {
  id: string;
  name: string;
  phone: string;
  requestedAt: string | null;
  completedAt: string | null;
  status: string;
  httpStatus: number | null;
  shoongCode: string | null;
  failureReason: string | null;
  messageId: string | null;
  groupId: string | null;
};

export default async function MessageHistoryDetailPage({ params }: PageProps) {
  const { jobId, messageId } = await params;
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) redirect("/login");

  const { data: job } = await supabase.from("course_jobs").select("id,name").eq("id", jobId).maybeSingle();
  if (!job) notFound();

  const detail = messageId.startsWith("test-")
    ? await loadTestDetail(supabase, jobId, messageId.slice(5))
    : await loadMessageDetail(supabase, jobId, messageId);
  if (!detail) notFound();
  const templateKey = detail.templateKey as MessageHistoryItem["templateKey"];

  return <main className="min-h-screen">
    <header className="border-b bg-background"><div className="mx-auto flex h-18 max-w-[1600px] items-center px-5 lg:px-8"><Button variant="ghost" size="sm" asChild><Link href={`/services/course-roster/${jobId}`}><ArrowLeft />작업 상세</Link></Button><div className="mx-3 h-5 w-px bg-border" /><span className="truncate font-semibold">발송 이력 상세</span></div></header>
    <div className="mx-auto max-w-[1600px] px-5 py-8 lg:px-8">
      <div className="mb-7"><Badge variant={detail.isTest ? "secondary" : "outline"} className="mb-3">{detail.isTest ? "테스트 발송" : MESSAGE_SCOPE_LABELS[detail.targetScope] ?? detail.targetScope}</Badge><h1 className="text-3xl font-semibold tracking-tight">{MESSAGE_TEMPLATE_LABELS[templateKey]}</h1><p className="mt-2 text-muted-foreground">{job.name} · {formatDateTime(detail.createdAt)}</p></div>
      <div className="grid gap-4 sm:grid-cols-3"><Metric title="발송 대상" value={detail.requestedCount} icon={<MessageSquareText className="size-4" />} /><Metric title="성공" value={detail.successCount} icon={<CheckCircle2 className="size-4 text-emerald-600" />} /><Metric title="실패" value={detail.failedCount} icon={<XCircle className="size-4 text-destructive" />} /></div>
      <Card className="mt-5"><CardHeader><CardTitle className="text-base">발송 정보</CardTitle></CardHeader><CardContent className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4"><Info label="템플릿" value={MESSAGE_TEMPLATE_LABELS[templateKey]} /><Info label="Template Code" value={detail.templateCode || "-"} mono /><Info label="발송 구분" value={detail.isTest ? "테스트 발송" : MESSAGE_SCOPE_LABELS[detail.targetScope] ?? detail.targetScope} /><Info label="요청 시간" value={formatDateTime(detail.createdAt)} /></CardContent></Card>
      <Card className="mt-5 overflow-hidden"><CardHeader><CardTitle className="text-base">수신자별 결과</CardTitle></CardHeader><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>수신자</TableHead><TableHead>연락처</TableHead><TableHead>발송 시간</TableHead><TableHead>성공 여부</TableHead><TableHead>응답 코드</TableHead><TableHead>실패 사유</TableHead></TableRow></TableHeader><TableBody>{detail.recipients.map((recipient) => <TableRow key={recipient.id}><TableCell className="font-medium">{recipient.name || "-"}</TableCell><TableCell className="font-mono">{formatPhone(recipient.phone)}</TableCell><TableCell className="whitespace-nowrap text-muted-foreground">{recipient.requestedAt ? formatDateTime(recipient.requestedAt) : formatDateTime(detail.createdAt)}</TableCell><TableCell><StatusBadge status={recipient.status} /></TableCell><TableCell className="font-mono text-xs">{[recipient.httpStatus && `HTTP ${recipient.httpStatus}`, recipient.shoongCode].filter(Boolean).join(" / ") || "-"}</TableCell><TableCell className="max-w-md text-sm text-muted-foreground">{recipient.failureReason || "-"}</TableCell></TableRow>)}</TableBody></Table></div></Card>
    </div>
  </main>;
}

async function loadMessageDetail(supabase: Awaited<ReturnType<typeof createClient>>, jobId: string, messageId: string) {
  const { data: message } = await supabase.from("message_jobs").select("id,template_key,template_code,target_scope,requested_count,success_count,failed_count,status,created_at").eq("id", messageId).eq("course_job_id", jobId).maybeSingle();
  if (!message) return null;
  const { data: recipientRows } = await supabase.from("message_recipients").select("id,enrollment_id,normalized_phone,status,http_status,shoong_code,group_id,message_id,failure_reason,requested_at,completed_at").eq("message_job_id", message.id).order("requested_at");
  const enrollmentIds = (recipientRows ?? []).map((recipient) => recipient.enrollment_id).filter((id): id is string => Boolean(id));
  const { data: enrollments } = enrollmentIds.length > 0 ? await supabase.from("job_enrollments").select("id,normalized_values").in("id", enrollmentIds) : { data: [] };
  const enrollmentValues = new Map((enrollments ?? []).map((enrollment) => [enrollment.id, enrollment.normalized_values as Record<string, string>]));
  const recipients: RecipientDetail[] = (recipientRows ?? []).map((recipient) => ({ id: recipient.id, name: enrollmentValues.get(recipient.enrollment_id)?.customerName ?? "", phone: recipient.normalized_phone, requestedAt: recipient.requested_at, completedAt: recipient.completed_at, status: recipient.status, httpStatus: recipient.http_status, shoongCode: recipient.shoong_code, failureReason: recipient.failure_reason, messageId: recipient.message_id, groupId: recipient.group_id }));
  return { isTest: false, templateKey: message.template_key as MessageHistoryItem["templateKey"], templateCode: message.template_code, targetScope: message.target_scope, requestedCount: message.requested_count, successCount: message.success_count, failedCount: message.failed_count, status: message.status, createdAt: message.created_at, recipients };
}

async function loadTestDetail(supabase: Awaited<ReturnType<typeof createClient>>, jobId: string, auditId: string) {
  if (!/^\d+$/.test(auditId)) return null;
  const { data: audit } = await supabase.from("audit_logs").select("id,metadata,created_at").eq("id", auditId).eq("entity_id", jobId).eq("event_type", "course_job.test_message_sent").maybeSingle();
  if (!audit) return null;
  const metadata = audit.metadata as Record<string, unknown>;
  const template = metadata.template;
  if (template !== "paid_confirm" && template !== "paid_invite") return null;
  const success = metadata.success === true;
  const recipient: RecipientDetail = { id: `test-${audit.id}`, name: typeof metadata.recipient_name === "string" ? metadata.recipient_name : "권정인", phone: "01023787490", requestedAt: audit.created_at, completedAt: audit.created_at, status: success ? "success" : "failed", httpStatus: typeof metadata.http_status === "number" ? metadata.http_status : null, shoongCode: typeof metadata.shoong_code === "string" ? metadata.shoong_code : null, failureReason: typeof metadata.failure_reason === "string" ? metadata.failure_reason : null, messageId: typeof metadata.message_id === "string" ? metadata.message_id : null, groupId: typeof metadata.group_id === "string" ? metadata.group_id : null };
  return { isTest: true, templateKey: template, templateCode: typeof metadata.template_code === "string" ? metadata.template_code : "", targetScope: "test", requestedCount: 1, successCount: success ? 1 : 0, failedCount: success ? 0 : 1, status: success ? "completed" : "failed", createdAt: audit.created_at, recipients: [recipient] };
}

function StatusBadge({ status }: { status: string }) { if (status === "success") return <Badge><CheckCircle2 />성공</Badge>; if (status === "unknown" || status === "pending") return <Badge variant="secondary"><Clock3 />{status === "pending" ? "대기" : "확인 필요"}</Badge>; return <Badge variant="destructive"><XCircle />실패</Badge>; }
function Metric({ title, value, icon }: { title: string; value: number; icon: React.ReactNode }) { return <Card><CardContent className="pt-6"><div className="flex items-center justify-between text-sm text-muted-foreground"><span>{title}</span>{icon}</div><strong className="mt-1 block text-2xl">{value.toLocaleString("ko-KR")}명</strong></CardContent></Card>; }
function Info({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) { return <div><p className="text-muted-foreground">{label}</p><p className={mono ? "mt-1 font-mono" : "mt-1 font-medium"}>{value}</p></div>; }
function formatDateTime(value: string) { return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(value)); }
