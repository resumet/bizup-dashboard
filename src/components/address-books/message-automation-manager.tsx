"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  Send,
  Settings2,
  TestTube2,
  UserRound,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatPhone } from "@/lib/jobs/filter";
import {
  formatCourseSelectionLabel,
  getCourseLinkOptions,
  isCourseLinkVariable,
  isCourseNameVariable,
  type MessageCourse,
} from "@/lib/messages/course-template-options";
import {
  canMapVariableToRecipientName,
  createAutomationTestKey,
  getRecipientNameVariables,
  type VariableInputMode,
} from "@/lib/messages/automation-config";
import { getTemplateVariables } from "@/lib/messages/custom-template";
import { formatTemplateSelectionLabel } from "@/lib/messages/shoong-guide";

type Book = {
  id: string;
  name: string;
  contact_count: number;
  updated_at: string;
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
type SelectedContact = {
  id: string;
  address_book_id: string;
  name: string | null;
  email: string | null;
  normalized_phone: string;
} | null;

export function MessageAutomationManager({
  books,
  templates,
  courses,
  initialBookId,
  selectedContact,
  loadError,
}: {
  books: Book[];
  templates: Template[];
  courses: MessageCourse[];
  initialBookId: string;
  selectedContact: SelectedContact;
  loadError?: string;
}) {
  const [bookId, setBookId] = useState(
    selectedContact?.address_book_id || initialBookId || "",
  );
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [variableValues, setVariableValues] = useState<Record<string, string>>(
    {},
  );
  const [variableModes, setVariableModes] = useState<
    Record<string, VariableInputMode>
  >({});
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [verifiedTestKey, setVerifiedTestKey] = useState("");
  const [testing, setTesting] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState("");
  const [resultKind, setResultKind] = useState<"success" | "error">("success");
  const [resultAction, setResultAction] = useState<"test" | "send">("test");
  const [copiedLinkVariable, setCopiedLinkVariable] = useState("");

  const selectedBook = books.find((book) => book.id === bookId);
  const selectedTemplate = templates.find(
    (template) => template.id === templateId,
  );
  const selectedCourse = courses.find(
    (course) => course.id === selectedCourseId,
  );
  const courseLinkOptions = selectedCourse
    ? getCourseLinkOptions(selectedCourse)
    : [];
  const templateVariables = selectedTemplate
    ? getTemplateVariables(
        selectedTemplate.applicant_variable,
        selectedTemplate.variable_names?.length
          ? selectedTemplate.variable_names
          : selectedTemplate.course_variable,
      )
    : [];
  const recipientNameVariables = getRecipientNameVariables(variableModes);
  const variablesReady = templateVariables.every(
    (variable) =>
      recipientNameVariables.includes(variable) ||
      variableValues[variable]?.trim(),
  );
  const recipientCount = selectedContact
    ? 1
    : (selectedBook?.contact_count ?? 0);
  const currentTestKey = createAutomationTestKey({
    addressBookId: selectedBook?.id ?? "",
    contactId: selectedContact?.id,
    templateId,
    variables: variableValues,
    recipientNameVariables,
  });
  const testVerified = Boolean(
    verifiedTestKey && verifiedTestKey === currentTestKey,
  );
  const settingsReady = Boolean(
    selectedBook && selectedTemplate && recipientCount > 0 && variablesReady,
  );

  function openCourseLink(variable: string) {
    const url = variableValues[variable]?.trim();
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function copyCourseLink(variable: string) {
    const url = variableValues[variable]?.trim();
    if (!url) return;

    try {
      await navigator.clipboard.writeText(url);
      setCopiedLinkVariable(variable);
      window.setTimeout(() => {
        setCopiedLinkVariable((current) =>
          current === variable ? "" : current,
        );
      }, 1500);
    } catch {
      setResultKind("error");
      setResultAction("test");
      setResult("링크를 클립보드에 복사하지 못했습니다.");
    }
  }

  async function sendTest() {
    if (!settingsReady) return;
    setTesting(true);
    setVerifiedTestKey("");
    setResult("");
    try {
      const response = await fetch("/api/messages/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId,
          variables: variableValues,
          recipientNameVariables,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(
          `${body.message ?? "테스트 발송에 실패했습니다."}${
            body.httpStatus
              ? ` (HTTP ${body.httpStatus}${body.shoongCode ? ` / ${body.shoongCode}` : ""})`
              : ""
          }`,
        );
      }
      setVerifiedTestKey(currentTestKey);
      setResultKind("success");
      setResultAction("test");
      setResult(body.message ?? "테스트 발송을 완료했습니다.");
    } catch (error) {
      setResultKind("error");
      setResultAction("test");
      setResult(
        error instanceof Error ? error.message : "테스트 발송에 실패했습니다.",
      );
    } finally {
      setTesting(false);
    }
  }

  async function sendMessages() {
    if (!selectedBook || !settingsReady || !testVerified) return;
    const targetLabel = selectedContact
      ? `${selectedContact.name || "이름 없음"}(${formatPhone(selectedContact.normalized_phone)})`
      : `${selectedBook.name} 전체 ${recipientCount.toLocaleString("ko-KR")}명`;
    if (!window.confirm(`${targetLabel}에게 메시지를 발송할까요?`)) return;

    setSending(true);
    setResult("");
    try {
      const response = await fetch(
        `/api/address-books/${selectedBook.id}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            templateId,
            variables: variableValues,
            recipientNameVariables,
            scope: selectedContact ? "selected" : "all",
            selectedIds: selectedContact ? [selectedContact.id] : [],
          }),
        },
      );
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.message ?? "발송 작업을 시작하지 못했습니다.");
      setVerifiedTestKey("");
      setResultKind("success");
      setResultAction("send");
      setResult(body.message ?? "발송 작업을 시작했습니다.");
    } catch (error) {
      setResultKind("error");
      setResultAction("send");
      setResult(
        error instanceof Error
          ? error.message
          : "발송 작업을 시작하지 못했습니다.",
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-primary">SHOONG AUTOMATION</p>
          <h1 className="mt-2 text-3xl font-semibold">알림톡·문자 자동화</h1>
          <p className="mt-2 text-muted-foreground">
            대상 주소록부터 선택한 뒤 템플릿과 변수를 설정해 발송하세요.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/services/message-automation/templates">
            <Settings2 />
            템플릿 관리
          </Link>
        </Button>
      </div>

      {loadError ? (
        <Alert variant="destructive">
          <AlertTitle>발송 설정 조회 실패</AlertTitle>
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      ) : null}
      {result ? (
        <Alert variant={resultKind === "error" ? "destructive" : "default"}>
          <AlertTitle>
            {resultKind === "error" ? "처리 실패" : "처리 결과"}
          </AlertTitle>
          <AlertDescription>{result}</AlertDescription>
          {resultKind === "success" &&
          resultAction === "send" &&
          selectedBook ? (
            <Button className="mt-3" size="sm" variant="outline" asChild>
              <Link href={`/services/message-automation/${selectedBook.id}`}>
                발송 이력 보기
              </Link>
            </Button>
          ) : null}
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Badge>1</Badge>대상 주소록 선택
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {selectedContact ? (
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border bg-background p-4">
              <div className="flex items-center gap-3">
                <UserRound className="size-5 text-primary" />
                <div>
                  <p className="font-medium">
                    {selectedContact.name || "이름 없음"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {formatPhone(selectedContact.normalized_phone)}
                    {selectedContact.email ? ` · ${selectedContact.email}` : ""}
                  </p>
                </div>
              </div>
              <Badge variant="secondary">
                {selectedBook?.name} · 단일 수신자
              </Badge>
            </div>
          ) : (
            <div className="grid gap-2">
              <Label>발송할 주소록</Label>
              <Select
                value={bookId}
                onValueChange={(value) => {
                  setBookId(value);
                  setResult("");
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="주소록을 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  {books.map((book) => (
                    <SelectItem
                      key={book.id}
                      value={book.id}
                      disabled={book.contact_count === 0}
                    >
                      {book.name} · {book.contact_count.toLocaleString("ko-KR")}
                      명
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {selectedBook ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="size-4 text-emerald-600" />
              {selectedContact
                ? "선택한 한 사람만 발송 대상에 포함됩니다."
                : `${selectedBook.name}의 전체 ${recipientCount.toLocaleString("ko-KR")}명이 발송 대상입니다.`}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Badge>2</Badge>보낼 템플릿 선택
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Select
            value={templateId}
            onValueChange={(value) => {
              setTemplateId(value);
              setVariableValues({});
              setVariableModes({});
              setSelectedCourseId("");
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Badge>3</Badge>템플릿 변수 입력
          </CardTitle>
        </CardHeader>
        <CardContent>
          {selectedTemplate ? (
            <div className="grid gap-4 md:grid-cols-2">
              {templateVariables.map((variable) => {
                const usesCourseName = isCourseNameVariable(variable);
                const usesCourseLink = isCourseLinkVariable(variable);
                const canUseRecipientName =
                  canMapVariableToRecipientName(variable);
                const variableMode = variableModes[variable] ?? "manual";
                const usesRecipientName =
                  canUseRecipientName && variableMode === "address-book-name";
                return (
                  <div key={variable} className="grid gap-2">
                    <Label htmlFor={`automation-variable-${variable}`}>
                      {variable}
                    </Label>
                    {usesCourseName ? (
                      <Select
                        value={selectedCourseId}
                        onValueChange={(courseId) => {
                          const course = courses.find(
                            (item) => item.id === courseId,
                          );
                          setSelectedCourseId(courseId);
                          setVariableValues((current) => ({
                            ...current,
                            ...Object.fromEntries(
                              templateVariables
                                .filter(isCourseNameVariable)
                                .map((nameVariable) => [
                                  nameVariable,
                                  course
                                    ? formatCourseSelectionLabel(course)
                                    : "",
                                ]),
                            ),
                            ...Object.fromEntries(
                              templateVariables
                                .filter(isCourseLinkVariable)
                                .map((linkVariable) => [linkVariable, ""]),
                            ),
                          }));
                          setResult("");
                        }}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="강의를 선택하세요" />
                        </SelectTrigger>
                        <SelectContent>
                          {courses.map((course) => (
                            <SelectItem key={course.id} value={course.id}>
                              {formatCourseSelectionLabel(course)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : canUseRecipientName ? (
                      <Select
                        value={variableMode}
                        onValueChange={(value) => {
                          setVariableModes((current) => ({
                            ...current,
                            [variable]: value as VariableInputMode,
                          }));
                          setResult("");
                        }}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="manual">직접 입력</SelectItem>
                          <SelectItem value="address-book-name">
                            주소록 이름 셀 연결
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    ) : null}
                    {usesCourseLink ? (
                      <div className="flex flex-wrap gap-2">
                        <Select
                          value={variableValues[variable] ?? ""}
                          onValueChange={(value) => {
                            setVariableValues((current) => ({
                              ...current,
                              [variable]: value,
                            }));
                            setCopiedLinkVariable("");
                            setResult("");
                          }}
                          disabled={!selectedCourse}
                        >
                          <SelectTrigger className="min-w-56 flex-1">
                            <SelectValue
                              placeholder={
                                selectedCourse
                                  ? "강의 링크를 선택하세요"
                                  : "먼저 강의를 선택하세요"
                              }
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {courseLinkOptions.map((option) => (
                              <SelectItem
                                key={option.field}
                                value={option.url || `empty:${option.field}`}
                                disabled={!option.url}
                              >
                                {option.label}
                                {option.url ? ` · ${option.url}` : " · 미입력"}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={!variableValues[variable]?.trim()}
                          onClick={() => openCourseLink(variable)}
                        >
                          <ExternalLink />새 창 열기
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={!variableValues[variable]?.trim()}
                          onClick={() => copyCourseLink(variable)}
                        >
                          {copiedLinkVariable === variable ? (
                            <Check />
                          ) : (
                            <Copy />
                          )}
                          {copiedLinkVariable === variable ? "복사됨" : "복사"}
                        </Button>
                      </div>
                    ) : (
                      <Input
                        id={`automation-variable-${variable}`}
                        value={
                          usesRecipientName
                            ? "주소록의 각 수신자 이름 자동 적용"
                            : (variableValues[variable] ?? "")
                        }
                        placeholder={`${variable} 값을 입력하세요`}
                        disabled={usesRecipientName || usesCourseName}
                        onChange={(event) => {
                          setVariableValues((current) => ({
                            ...current,
                            [variable]: event.target.value,
                          }));
                          setResult("");
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              템플릿을 선택하면 필요한 변수가 표시됩니다.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TestTube2 className="size-5" />
              테스트 발송
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="font-medium">권정인 · 010-2378-7490</p>
              <p className="mt-1 text-sm text-muted-foreground">
                현재 주소록·템플릿·변수 설정으로 테스트합니다.
              </p>
            </div>
            <Button
              className="w-full"
              variant="outline"
              onClick={sendTest}
              disabled={testing || sending || !settingsReady}
            >
              {testing ? <Loader2 className="animate-spin" /> : <TestTube2 />}
              {testing ? "테스트 발송 중" : "테스트 발송"}
            </Button>
          </CardContent>
        </Card>

        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Send className="size-5" />
              {selectedContact ? "선택한 1명에게 발송" : "전체 발송"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex min-h-12 items-center gap-2 text-sm">
              {testVerified ? (
                <>
                  <CheckCircle2 className="size-5 text-emerald-600" />
                  <span className="font-medium text-emerald-700">
                    현재 설정으로 테스트 발송 완료
                  </span>
                </>
              ) : (
                <span className="text-muted-foreground">
                  먼저 현재 설정으로 테스트 발송을 완료해야 합니다.
                </span>
              )}
            </div>
            <Button
              className="w-full"
              onClick={sendMessages}
              disabled={sending || testing || !settingsReady || !testVerified}
            >
              {sending ? <Loader2 className="animate-spin" /> : <Send />}
              {sending
                ? "발송 작업 등록 중"
                : selectedContact
                  ? "선택한 1명에게 발송하기"
                  : `전체 ${recipientCount.toLocaleString("ko-KR")}명 발송하기`}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
