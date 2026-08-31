import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";

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
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

function statusLabel(status: string) {
  if (status === "completed") return "완료";
  if (status === "partial") return "일부 실패";
  if (status === "failed") return "실패";
  return "진행 중";
}

export default async function MessageAutomationHistoryPage() {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) redirect("/login");
  const { data, error } = await supabase
    .from("address_book_message_jobs")
    .select(
      "id,address_book_id,template_code,target_scope,requested_count,success_count,failed_count,status,created_at,address_books(name),message_templates(name)",
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(`발송 이력 조회 실패: ${error.code}`);
  return (
    <main className="min-h-screen">
      <header className="border-b">
        <div className="mx-auto flex h-18 max-w-[1600px] items-center px-5 lg:px-8">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/services/message-automation">
              <ArrowLeft />
              문자 자동화
            </Link>
          </Button>
          <div className="mx-3 h-5 w-px bg-border" />
          <span className="font-semibold">발송 이력</span>
        </div>
      </header>
      <div className="mx-auto max-w-[1600px] px-5 py-10 lg:px-8">
        <h1 className="text-3xl font-semibold">알림톡·문자 발송 이력</h1>
        <p className="mt-2 mb-8 text-muted-foreground">
          최근 발송 작업 200건을 확인합니다.
        </p>
        <Card>
          <CardHeader>
            <CardTitle>기존 발송 내역</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>발송시간</TableHead>
                  <TableHead>주소록</TableHead>
                  <TableHead>템플릿</TableHead>
                  <TableHead>범위</TableHead>
                  <TableHead className="text-right">요청</TableHead>
                  <TableHead className="text-right">성공</TableHead>
                  <TableHead className="text-right">실패</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead className="text-right">상세</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data ?? []).map((job) => {
                  const book = Array.isArray(job.address_books)
                    ? job.address_books[0]
                    : job.address_books;
                  const template = Array.isArray(job.message_templates)
                    ? job.message_templates[0]
                    : job.message_templates;
                  return (
                    <TableRow key={job.id}>
                      <TableCell className="whitespace-nowrap">
                        {new Date(job.created_at).toLocaleString("ko-KR")}
                      </TableCell>
                      <TableCell>{book?.name ?? "삭제된 주소록"}</TableCell>
                      <TableCell>
                        <p className="font-medium">
                          {template?.name ?? job.template_code}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {job.template_code}
                        </p>
                      </TableCell>
                      <TableCell>
                        {job.target_scope === "test"
                          ? "테스트"
                          : job.target_scope === "selected"
                            ? "선택"
                            : job.target_scope === "filtered"
                              ? "필터"
                              : "전체"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {job.requested_count.toLocaleString("ko-KR")}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {job.success_count.toLocaleString("ko-KR")}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {job.failed_count.toLocaleString("ko-KR")}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            job.status === "completed"
                              ? "default"
                              : job.status === "processing"
                                ? "secondary"
                                : "destructive"
                          }
                        >
                          {statusLabel(job.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" asChild>
                          <Link
                            href={`/services/address-books/${job.address_book_id}`}
                          >
                            <ExternalLink />
                            보기
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {(data ?? []).length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                아직 발송 이력이 없습니다.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
