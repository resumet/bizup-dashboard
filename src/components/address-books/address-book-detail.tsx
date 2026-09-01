"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Download,
  FileUp,
  Loader2,
  MessageSquareText,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Send,
  TestTube2,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { formatPhone } from "@/lib/jobs/filter";
import { hasProcessingMessageJob } from "@/lib/messages/dispatch";
import { getTemplateInputVariables } from "@/lib/messages/custom-template";
import { formatTemplateSelectionLabel } from "@/lib/messages/shoong-guide";
type Contact = {
  id: string;
  name: string | null;
  email: string | null;
  normalized_phone: string;
};
type Template = {
  id: string;
  name: string;
  template_code: string;
  send_type: string;
  applicant_variable: string;
  course_variable: string;
  variable_names: string[];
  is_system: boolean;
};
type History = {
  id: string;
  template_code: string;
  target_scope: string;
  requested_count: number;
  success_count: number;
  failed_count: number;
  status: string;
  created_at: string;
  message_templates: { name: string } | null;
};
export function AddressBookDetail({
  mode,
  book,
  contacts,
  totalContacts,
  currentPage,
  contactsPerPage,
  initialKeyword,
  initialSort,
  templates,
  history,
  loadError,
}: {
  mode: "manager" | "automation";
  book: { id: string; name: string; contact_count: number; updated_at: string };
  contacts: Contact[];
  totalContacts: number;
  currentPage: number;
  contactsPerPage: number;
  initialKeyword: string;
  initialSort: "nameAsc" | "nameDesc";
  templates: Template[];
  history: History[];
  loadError?: string;
}) {
  const router = useRouter();
  const [keyword, setKeyword] = useState(initialKeyword);
  const [sort, setSort] = useState(initialSort);
  const [name, setName] = useState(book.name);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [variableValues, setVariableValues] = useState<Record<string, string>>(
    {},
  );
  const [testing, setTesting] = useState(false);
  const selectedTemplate = templates.find(
    (template) => template.id === templateId,
  );
  const templateInputVariables = selectedTemplate
    ? getTemplateInputVariables(
        selectedTemplate.applicant_variable,
        selectedTemplate.variable_names?.length
          ? selectedTemplate.variable_names
          : selectedTemplate.course_variable,
      )
    : [];
  const variablesReady = templateInputVariables.every((variable) =>
    variableValues[variable]?.trim(),
  );
  const hasProcessingJob = hasProcessingMessageJob(history);
  const pageCount = Math.max(1, Math.ceil(totalContacts / contactsPerPage));

  useEffect(() => {
    if (mode !== "automation" || !hasProcessingJob) return;
    const timer = window.setInterval(() => router.refresh(), 3_000);
    return () => window.clearInterval(timer);
  }, [hasProcessingJob, mode, router]);
  function contactsHref(
    nextPage: number,
    nextKeyword = initialKeyword,
    nextSort = sort,
  ) {
    const params = new URLSearchParams();
    const normalizedKeyword = nextKeyword.trim();
    if (normalizedKeyword) params.set("q", normalizedKeyword);
    if (nextSort === "nameDesc") params.set("sort", nextSort);
    if (nextPage > 1) params.set("page", String(nextPage));
    const query = params.toString();
    const basePath =
      mode === "manager"
        ? `/services/address-books/${book.id}`
        : `/services/message-automation/${book.id}`;
    return `${basePath}${query ? `?${query}` : ""}`;
  }
  function navigateContacts(
    nextPage: number,
    nextKeyword = initialKeyword,
    nextSort = sort,
  ) {
    router.push(contactsHref(nextPage, nextKeyword, nextSort));
  }
  async function rename() {
    setBusy(true);
    const response = await fetch(`/api/address-books/${book.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setBusy(false);
    if (response.ok) router.refresh();
    else setResult((await response.json()).message);
  }
  async function upload() {
    if (!file) return;
    setBusy(true);
    const form = new FormData();
    form.set("file", file);
    const response = await fetch(`/api/address-books/${book.id}/imports`, {
      method: "POST",
      body: form,
    });
    const body = await response.json();
    setBusy(false);
    setResult(
      response.ok
        ? `업데이트 ${body.importedCount}명 · 제외 ${body.skippedCount}명`
        : body.message,
    );
    if (response.ok) router.refresh();
  }
  async function sendAll() {
    if (
      !window.confirm(
        `${book.contact_count.toLocaleString("ko-KR")}명 전체에게 메시지를 발송할까요?`,
      )
    ) {
      return;
    }
    setBusy(true);
    setResult("");
    const response = await fetch(`/api/address-books/${book.id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        templateId,
        variables: variableValues,
        scope: "all",
      }),
    });
    const body = await response.json();
    setBusy(false);
    setResult(response.ok ? body.message : body.message);
    if (response.ok) router.refresh();
  }
  async function sendTest() {
    setTesting(true);
    setResult("");
    const response = await fetch(
      `/api/address-books/${book.id}/messages/test`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId, variables: variableValues }),
      },
    );
    const body = await response.json();
    setTesting(false);
    setResult(
      response.ok
        ? body.message
        : `${body.message ?? "테스트 발송에 실패했습니다."}${body.httpStatus ? ` (HTTP ${body.httpStatus}${body.shoongCode ? ` / ${body.shoongCode}` : ""})` : ""}`,
    );
    router.refresh();
  }
  if (loadError)
    return (
      <Alert variant="destructive">
        <AlertTitle>주소록 조회 실패</AlertTitle>
        <AlertDescription>{loadError}</AlertDescription>
      </Alert>
    );
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Badge variant="outline">
            {book.contact_count.toLocaleString("ko-KR")}명
          </Badge>
          <h1 className="mt-3 text-3xl font-semibold">{book.name}</h1>
          <p className="mt-2 text-muted-foreground">
            {mode === "manager"
              ? "주소록의 연락처를 검색하고 파일로 업데이트합니다."
              : "템플릿과 변수를 설정해 주소록 전체에 Shoong 알림톡·문자를 발송합니다."}
          </p>
        </div>
        {mode === "manager" ? (
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <a href={`/api/address-books/${book.id}/export`}>
                <Download />
                Excel 다운로드
              </a>
            </Button>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Pencil />
                  이름 수정
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>주소록 이름 수정</DialogTitle>
                </DialogHeader>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
                <DialogFooter>
                  <Button onClick={rename} disabled={busy || !name.trim()}>
                    저장
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <FileUp />
                  Excel 추가
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>주소록 업데이트</DialogTitle>
                  <DialogDescription>
                    동일 전화번호는 이름과 이메일을 업데이트합니다.
                  </DialogDescription>
                </DialogHeader>
                <Input
                  type="file"
                  accept=".csv,.xlsx"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                <DialogFooter>
                  <Button onClick={upload} disabled={busy || !file}>
                    {busy ? <Loader2 className="animate-spin" /> : <FileUp />}
                    업데이트
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href="/services/message-automation/templates">
                <Plus />
                템플릿 관리
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href={`/services/address-books/${book.id}`}>
                주소록 관리
              </Link>
            </Button>
          </div>
        )}
      </div>
      {result ? (
        <Alert>
          <AlertTitle>처리 결과</AlertTitle>
          <AlertDescription className="whitespace-pre-line">
            {result}
          </AlertDescription>
        </Alert>
      ) : null}
      {mode === "automation" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">메시지 발송 설정</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <section
              className="grid gap-2"
              aria-labelledby="template-step-title"
            >
              <div className="flex items-center gap-2">
                <Badge>1</Badge>
                <Label id="template-step-title">보낼 템플릿 선택</Label>
              </div>
              <Select
                value={templateId}
                onValueChange={(value) => {
                  setTemplateId(value);
                  setVariableValues({});
                  setResult("");
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="템플릿을 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {formatTemplateSelectionLabel(
                        template.send_type,
                        template.name,
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedTemplate ? (
                <p className="text-xs text-muted-foreground">
                  Template Code: {selectedTemplate.template_code}
                </p>
              ) : null}
            </section>

            <section
              className="grid gap-3"
              aria-labelledby="variable-step-title"
            >
              <div className="flex items-center gap-2">
                <Badge>2</Badge>
                <Label id="variable-step-title">템플릿 변수 입력</Label>
              </div>
              {selectedTemplate ? (
                <div className="grid gap-4 rounded-lg border p-4 md:grid-cols-2">
                  <div className="grid gap-2">
                    <Label>{selectedTemplate.applicant_variable}</Label>
                    <Input value="주소록의 수신자 이름 자동 적용" disabled />
                  </div>
                  {templateInputVariables.map((variable) => (
                    <div key={variable} className="grid gap-2">
                      <Label htmlFor={`template-variable-${variable}`}>
                        {variable}
                      </Label>
                      <Input
                        id={`template-variable-${variable}`}
                        placeholder={`${variable} 값을 입력하세요`}
                        value={variableValues[variable] ?? ""}
                        onChange={(event) =>
                          setVariableValues((current) => ({
                            ...current,
                            [variable]: event.target.value,
                          }))
                        }
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  템플릿을 선택하면 필요한 변수가 표시됩니다.
                </p>
              )}
            </section>

            <div className="grid gap-4 border-t pt-6 md:grid-cols-2">
              <section
                className="rounded-lg border p-4"
                aria-labelledby="test-step-title"
              >
                <div className="flex items-center gap-2">
                  <Badge>3</Badge>
                  <Label id="test-step-title">테스트 발송</Label>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  권정인 · 010-2378-7490으로 먼저 확인합니다.
                </p>
                <Button
                  className="mt-4 w-full"
                  variant="outline"
                  onClick={sendTest}
                  disabled={testing || busy || !templateId || !variablesReady}
                >
                  {testing ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <TestTube2 />
                  )}
                  {testing ? "테스트 발송 중" : "010-2378-7490 테스트 발송"}
                </Button>
              </section>

              <section
                className="rounded-lg border border-primary/30 bg-primary/5 p-4"
                aria-labelledby="send-step-title"
              >
                <div className="flex items-center gap-2">
                  <Badge>4</Badge>
                  <Label id="send-step-title">전체 발송</Label>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  주소록 전체 {book.contact_count.toLocaleString("ko-KR")}명에게
                  발송합니다.
                </p>
                <Button
                  className="mt-4 w-full"
                  onClick={sendAll}
                  disabled={busy || testing || !templateId || !variablesReady}
                >
                  {busy ? <Loader2 className="animate-spin" /> : <Send />}
                  {busy
                    ? "발송 작업 등록 중"
                    : `전체 ${book.contact_count.toLocaleString("ko-KR")}명 발송하기`}
                </Button>
              </section>
            </div>
          </CardContent>
        </Card>
      ) : null}
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="text-base">
            연락처 {totalContacts.toLocaleString("ko-KR")}명
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              navigateContacts(1, keyword);
            }}
          >
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="이름·이메일·전화번호 검색"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
              />
            </div>
            <Button type="submit" variant="outline">
              <Search />
              검색
            </Button>
            <Select
              value={sort}
              onValueChange={(value) => {
                const nextSort = value as "nameAsc" | "nameDesc";
                setSort(nextSort);
                navigateContacts(1, keyword, nextSort);
              }}
            >
              <SelectTrigger
                className="w-full sm:w-44"
                aria-label="연락처 이름 정렬"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nameAsc">이름 오름차순</SelectItem>
                <SelectItem value="nameDesc">이름 내림차순</SelectItem>
              </SelectContent>
            </Select>
          </form>
        </CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>이름</TableHead>
              <TableHead>전화번호</TableHead>
              <TableHead>이메일</TableHead>
              <TableHead className="w-14">
                <span className="sr-only">옵션</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contacts.map((c) => (
              <TableRow key={c.id}>
                <TableCell>{c.name || "-"}</TableCell>
                <TableCell className="font-mono">
                  {formatPhone(c.normalized_phone)}
                </TableCell>
                <TableCell>{c.email || "-"}</TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`${c.name || "연락처"} 옵션 열기`}
                      >
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <Link
                          href={`/services/message-automation?bookId=${book.id}&contactId=${c.id}`}
                        >
                          <MessageSquareText />
                          문자 보내기
                        </Link>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
          <span className="text-muted-foreground">
            {currentPage.toLocaleString("ko-KR")} /{" "}
            {pageCount.toLocaleString("ko-KR")} 페이지 · 페이지당{" "}
            {contactsPerPage}명
          </span>
          <div className="flex gap-2">
            {currentPage <= 1 ? (
              <Button variant="outline" size="sm" disabled>
                이전
              </Button>
            ) : (
              <Button variant="outline" size="sm" asChild>
                <Link href={contactsHref(currentPage - 1)}>이전</Link>
              </Button>
            )}
            {currentPage >= pageCount ? (
              <Button variant="outline" size="sm" disabled>
                다음
              </Button>
            ) : (
              <Button variant="outline" size="sm" asChild>
                <Link href={contactsHref(currentPage + 1)}>다음</Link>
              </Button>
            )}
          </div>
        </div>
      </Card>
      {mode === "automation" ? (
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquareText className="size-4" />
              발송 이력
            </CardTitle>
          </CardHeader>
          {history.length === 0 ? (
            <CardContent>
              <p className="py-8 text-center text-sm text-muted-foreground">
                발송 이력이 없습니다.
              </p>
            </CardContent>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>시간</TableHead>
                  <TableHead>템플릿</TableHead>
                  <TableHead className="text-right">대상</TableHead>
                  <TableHead className="text-right">성공</TableHead>
                  <TableHead className="text-right">실패</TableHead>
                  <TableHead>상태</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell>
                      {new Date(h.created_at).toLocaleString("ko-KR")}
                    </TableCell>
                    <TableCell>
                      {h.message_templates?.name || h.template_code}
                    </TableCell>
                    <TableCell className="text-right">
                      {h.target_scope === "test"
                        ? "테스트 1명"
                        : `전체 ${h.requested_count.toLocaleString("ko-KR")}명`}
                    </TableCell>
                    <TableCell className="text-right text-emerald-600">
                      {h.success_count}
                    </TableCell>
                    <TableCell className="text-right text-destructive">
                      {h.failed_count}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          h.status === "completed" ? "default" : "secondary"
                        }
                      >
                        {h.status === "processing"
                          ? `진행 중 ${(
                              h.success_count + h.failed_count
                            ).toLocaleString(
                              "ko-KR",
                            )} / ${h.requested_count.toLocaleString("ko-KR")}`
                          : h.status === "completed"
                            ? "완료"
                            : h.status === "partial_failed"
                              ? "일부 실패"
                              : h.status === "failed"
                                ? "실패"
                                : h.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      ) : null}
    </div>
  );
}
