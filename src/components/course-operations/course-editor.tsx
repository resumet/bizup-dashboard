"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ExternalLink,
  Calculator,
  Loader2,
  MessageSquareText,
  Plus,
  Save,
  Trash2,
} from "lucide-react";

import { CourseRosterSections } from "@/components/course-operations/course-roster-sections";
import { CourseShareDialog } from "@/components/course-operations/course-share-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import type {
  AddressBookSummary,
  CourseRosterAnalysis,
  CourseStudentPreview,
  CourseOperationsDraft,
  FreeStudentPreview,
  LinkableMessageProject,
  LinkableRosterJob,
} from "@/lib/course-operations/types";
import { calculateDiscountRate } from "@/lib/course-operations/pricing";
import {
  koreaDateTimeToIso,
  koreaDateToIso,
  toKoreaDate,
  toWebinarTime,
  WEBINAR_TIME_OPTIONS,
} from "@/lib/course-operations/schedule";

function formatPrice(value: string) {
  const digits = value.replace(/\D/gu, "");
  return digits ? Number(digits).toLocaleString("ko-KR") : "";
}

function formatDiscountRate(listPrice: string, salePrice: string) {
  const rate = calculateDiscountRate(listPrice, salePrice);
  return rate === null ? "-" : `${rate}%`;
}

type CourseLinkFieldKey =
  | "freeKakaoRoom1Link"
  | "freeKakaoRoom2Link"
  | "communicationRoomLink"
  | "paymentLink"
  | "inquiryLink"
  | "curriculumLink"
  | "freeGiftLink"
  | "courseViewingLink";

const COURSE_LINKS: Array<{ field: CourseLinkFieldKey; label: string }> = [
  { field: "freeKakaoRoom1Link", label: "무료카톡방 1번" },
  { field: "freeKakaoRoom2Link", label: "무료카톡방 2번" },
  { field: "communicationRoomLink", label: "소통방" },
  { field: "paymentLink", label: "결제링크" },
  { field: "inquiryLink", label: "문의하기 링크" },
  { field: "curriculumLink", label: "커리큘럼 보기 링크" },
  { field: "freeGiftLink", label: "무료강의 수강 선물받기 링크" },
  { field: "courseViewingLink", label: "강의 시청하기 링크" },
];

function getOpenableLink(value: string) {
  try {
    const parsed = new URL(value);
    return ["http:", "https:"].includes(parsed.protocol)
      ? parsed.toString()
      : "";
  } catch {
    return "";
  }
}

function CourseLinkInput({
  field,
  label,
  value,
  onChange,
}: {
  field: CourseLinkFieldKey;
  label: string;
  value: string;
  onChange: (field: CourseLinkFieldKey, value: string) => void;
}) {
  const openableLink = getOpenableLink(value);
  const inputId = `course-link-${field}`;
  return (
    <TableRow>
      <TableCell className="w-[180px]">
        <Label htmlFor={inputId} className="font-medium">
          {label}
        </Label>
      </TableCell>
      <TableCell>
        <Input
          id={inputId}
          className="h-10 min-w-[320px]"
          type="url"
          inputMode="url"
          placeholder="https://"
          maxLength={2_000}
          value={value}
          onChange={(event) => onChange(field, event.target.value)}
        />
      </TableCell>
      <TableCell className="w-[100px] text-center">
        <Button
          type="button"
          variant="outline"
          className="h-10"
          disabled={!openableLink}
          asChild={Boolean(openableLink)}
        >
          {openableLink ? (
            <a href={openableLink} target="_blank" rel="noopener noreferrer">
              <ExternalLink />
              열기
            </a>
          ) : (
            <span>
              <ExternalLink />
              열기
            </span>
          )}
        </Button>
      </TableCell>
    </TableRow>
  );
}

export function CourseOperationsEditor({
  courseId,
  initialDraft,
  rosterJobs,
  messageProjects,
  addressBooks,
  paidStudentPreview = [],
  paidRosterAnalysis,
  freeStudentPreview = [],
  loadError,
}: {
  courseId?: string;
  initialDraft: CourseOperationsDraft;
  rosterJobs: LinkableRosterJob[];
  messageProjects: LinkableMessageProject[];
  addressBooks: AddressBookSummary[];
  paidStudentPreview?: CourseStudentPreview[];
  paidRosterAnalysis?: CourseRosterAnalysis;
  freeStudentPreview?: FreeStudentPreview[];
  loadError?: string;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(() => ({
    ...initialDraft,
    messageProjectIds: initialDraft.messageProjectIds.slice(0, 1),
    freeWebinarAt: toKoreaDate(initialDraft.freeWebinarAt),
    freeWebinarTime: toWebinarTime(initialDraft.freeWebinarAt),
    startsAt: toKoreaDate(initialDraft.startsAt),
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  function updateField(
    field: Exclude<
      keyof CourseOperationsDraft,
      "options" | "youtubeAppearances" | "rosterJobIds" | "messageProjectIds"
    >,
    value: string,
  ) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  async function saveCourse() {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        courseId
          ? `/api/course-operations/${courseId}`
          : "/api/course-operations",
        {
          method: courseId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...draft,
            freeWebinarAt: koreaDateTimeToIso(
              draft.freeWebinarAt,
              draft.freeWebinarTime,
            ),
            startsAt: koreaDateToIso(draft.startsAt),
            options: draft.options.map((option) => ({
              ...option,
              listPrice: option.listPrice.replace(/\D/gu, ""),
              salePrice: option.salePrice.replace(/\D/gu, ""),
            })),
          }),
        },
      );
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.message ?? "강의 정보를 저장하지 못했습니다.");
      }
      if (!courseId) {
        router.push(`/services/course-operations/${body.id}`);
        return;
      }
      setNotice("강의 정보와 연결 항목을 저장했습니다.");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "강의 정보를 저장하지 못했습니다.",
      );
    } finally {
      setSaving(false);
    }
  }

  const selectedMessageProject = messageProjects.find(
    (project) => project.id === draft.messageProjectIds[0],
  );
  const selectedMessageGeneratedCount = selectedMessageProject
    ? selectedMessageProject.message_studio_resources.filter((resource) =>
        resource.generated_text.trim(),
      ).length
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <Badge variant="outline" className="mb-3">
            COURSE ID · {courseId ?? "생성 전"}
          </Badge>
          <h1 className="text-3xl font-semibold tracking-tight">
            {courseId ? draft.name || "강의 운영 정보" : "새 강의 만들기"}
          </h1>
          <p className="mt-2 text-muted-foreground">
            강의를 기준으로 일정, 가격, 수강생 명단과 문자 제작물을 연결합니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {courseId ? (
            <Button
              className="min-h-10 bg-violet-600 text-white hover:bg-violet-700 focus-visible:border-violet-700 focus-visible:ring-violet-500/40"
              asChild
            >
              <Link href={`/services/course-operations/${courseId}/settlements`}>
                <Calculator />
                강의별 정산
              </Link>
            </Button>
          ) : null}
          <CourseShareDialog
            data={{
              name: draft.name,
              instructorName: draft.instructorName,
              freeWebinarDate: draft.freeWebinarAt,
              freeWebinarTime: draft.freeWebinarTime,
              startsDate: draft.startsAt,
              earlyBirdEvent: draft.earlyBirdEvent,
              first50Event: draft.first50Event,
              freeKakaoRoom1Link: draft.freeKakaoRoom1Link,
              freeKakaoRoom2Link: draft.freeKakaoRoom2Link,
              communicationRoomLink: draft.communicationRoomLink,
              paymentLink: draft.paymentLink,
              inquiryLink: draft.inquiryLink,
              curriculumLink: draft.curriculumLink,
              freeGiftLink: draft.freeGiftLink,
              courseViewingLink: draft.courseViewingLink,
              options: draft.options,
              youtubeAppearances: draft.youtubeAppearances,
            }}
          />
          <Button className="min-h-10" onClick={saveCourse} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : <Save />}
            {saving ? "저장 중" : courseId ? "변경사항 저장" : "강의 만들기"}
          </Button>
        </div>
      </div>

      {loadError ? (
        <Alert variant="destructive">
          <AlertTitle>연결 항목을 모두 불러오지 못했습니다</AlertTitle>
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>저장할 수 없습니다</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {notice ? (
        <Alert>
          <AlertTitle>저장 완료</AlertTitle>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      ) : null}

      <Card className="border-primary/30">
        <CardHeader>
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
              <MessageSquareText className="size-5" />
            </span>
            <div>
              <CardTitle>웨비나 문자 목록 서비스 연결</CardTitle>
              <CardDescription className="mt-1">
                이 강의에서 사용할 문자 30개 프로젝트를 선택하거나 연결을
                해제합니다.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {messageProjects.length === 0 ? (
            <div className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">
              연결 가능한 문자 제작 프로젝트가 없습니다.
              <Button variant="link" asChild className="ml-1">
                <Link href="/services/message-studio">
                  문자 프로젝트 만들기
                </Link>
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
              <div className="grid min-w-0 flex-1 gap-2">
                <Label htmlFor="message-project-select">문자 목록</Label>
                <Select
                  value={draft.messageProjectIds[0] ?? ""}
                  onValueChange={(messageProjectId) =>
                    setDraft((current) => ({
                      ...current,
                      messageProjectIds: [messageProjectId],
                    }))
                  }
                >
                  <SelectTrigger id="message-project-select" className="w-full">
                    <SelectValue placeholder="연결할 문자 목록을 선택하세요" />
                  </SelectTrigger>
                  <SelectContent>
                    {messageProjects.map((project) => {
                      const generatedCount =
                        project.message_studio_resources.filter((resource) =>
                          resource.generated_text.trim(),
                        ).length;
                      return (
                        <SelectItem key={project.id} value={project.id}>
                          {project.course_name} ·{" "}
                          {project.instructor_name || "강사 미입력"} ·{" "}
                          {generatedCount}/30 생성
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={!selectedMessageProject}
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      messageProjectIds: [],
                    }))
                  }
                >
                  선택 해제
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!selectedMessageProject}
                  asChild={Boolean(selectedMessageProject)}
                >
                  {selectedMessageProject ? (
                    <Link
                      href={`/services/message-studio/${selectedMessageProject.id}`}
                    >
                      <ExternalLink />
                      목록 열기 ({selectedMessageGeneratedCount}/30)
                    </Link>
                  ) : (
                    <span>
                      <ExternalLink />
                      목록 열기
                    </span>
                  )}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>기본 정보와 일정</CardTitle>
            <CardDescription>
              강의를 식별하고 운영할 기본 정보입니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 md:grid-cols-3">
            <div className="grid gap-2 md:col-span-3">
              <Label htmlFor="course-name">강의명</Label>
              <Input
                id="course-name"
                className="h-10"
                placeholder="예: AI 수익화 퍼널 실전 클래스"
                maxLength={200}
                value={draft.name}
                onChange={(event) => updateField("name", event.target.value)}
              />
            </div>
            <div className="grid gap-2 md:col-span-3">
              <Label htmlFor="instructor-name">강사명</Label>
              <Input
                id="instructor-name"
                className="h-10"
                maxLength={120}
                value={draft.instructorName}
                onChange={(event) =>
                  updateField("instructorName", event.target.value)
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="free-webinar-date">무료 웨비나 날짜</Label>
              <Input
                id="free-webinar-date"
                className="h-10"
                type="date"
                required
                value={draft.freeWebinarAt}
                onChange={(event) =>
                  updateField("freeWebinarAt", event.target.value)
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="free-webinar-time">무료 웨비나 시간</Label>
              <Select
                value={draft.freeWebinarTime}
                onValueChange={(freeWebinarTime) =>
                  setDraft((current) => ({ ...current, freeWebinarTime }))
                }
                required
              >
                <SelectTrigger id="free-webinar-time" className="h-10 w-full">
                  <SelectValue placeholder="시간 선택" />
                </SelectTrigger>
                <SelectContent>
                  {WEBINAR_TIME_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="starts-at">개강일</Label>
              <Input
                id="starts-at"
                className="h-10"
                type="date"
                required
                value={draft.startsAt}
                onChange={(event) =>
                  updateField("startsAt", event.target.value)
                }
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>링크 관리</CardTitle>
            <CardDescription>
              카톡방·웨비나·강의 링크를 한 목록에서 관리합니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table className="min-w-[720px]">
              <TableHeader>
                <TableRow>
                  <TableHead>이름</TableHead>
                  <TableHead>링크</TableHead>
                  <TableHead className="text-center">바로가기</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {COURSE_LINKS.map((item) => (
                  <CourseLinkInput
                    key={item.field}
                    field={item.field}
                    label={item.label}
                    value={draft[item.field]}
                    onChange={updateField}
                  />
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>판매 이벤트</CardTitle>
            <CardDescription>
              기간, 혜택, 제공 조건을 자유롭게 기록합니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="early-bird-event">얼리버드 이벤트</Label>
              <Textarea
                id="early-bird-event"
                className="h-32 min-h-32 max-h-32 resize-none overflow-y-auto field-sizing-fixed"
                placeholder="예: 9월 1일까지 10만원 할인"
                maxLength={2_000}
                value={draft.earlyBirdEvent}
                onChange={(event) =>
                  updateField("earlyBirdEvent", event.target.value)
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="first-50-event">선착순 50명 이벤트</Label>
              <Textarea
                id="first-50-event"
                className="h-32 min-h-32 max-h-32 resize-none overflow-y-auto field-sizing-fixed"
                placeholder="예: 워크북과 1:1 피드백 제공"
                maxLength={2_000}
                value={draft.first50Event}
                onChange={(event) =>
                  updateField("first50Event", event.target.value)
                }
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>강의 옵션과 가격</CardTitle>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setDraft((current) => ({
                    ...current,
                    options: [
                      ...current.options,
                      {
                        name: "",
                        listPrice: "",
                        salePrice: "",
                        groupChatLink: "",
                        entryCode: "",
                      },
                    ],
                  }))
                }
              >
                <Plus />
                옵션 추가
              </Button>
            </div>
            <CardDescription>
              옵션별 정가와 실제 판매 할인가를 입력합니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto pb-1">
              <div className="min-w-[1160px] space-y-2">
                <div className="grid grid-cols-[minmax(200px,1fr)_130px_130px_72px_minmax(260px,1fr)_120px_44px] items-center gap-2 px-1 text-xs font-medium text-muted-foreground">
                  <span>옵션명</span>
                  <span>정가</span>
                  <span>할인가</span>
                  <span>할인율</span>
                  <span>단톡방 주소</span>
                  <span>입장코드</span>
                  <span className="sr-only">삭제</span>
                </div>
                {draft.options.map((option, index) => (
                  <div
                    key={`option-${index}`}
                    className="grid grid-cols-[minmax(200px,1fr)_130px_130px_72px_minmax(260px,1fr)_120px_44px] items-center gap-2"
                  >
                    <Input
                      id={`option-name-${index}`}
                      className="h-10"
                      aria-label={`${index + 1}번 옵션명`}
                      placeholder="예: 기본 과정"
                      value={option.name}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          options: current.options.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, name: event.target.value }
                              : item,
                          ),
                        }))
                      }
                    />
                    <Input
                      id={`list-price-${index}`}
                      className="h-10 text-right"
                      aria-label={`${index + 1}번 옵션 정가`}
                      inputMode="numeric"
                      placeholder="0"
                      value={formatPrice(option.listPrice)}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          options: current.options.map((item, itemIndex) =>
                            itemIndex === index
                              ? {
                                  ...item,
                                  listPrice: event.target.value.replace(
                                    /\D/gu,
                                    "",
                                  ),
                                }
                              : item,
                          ),
                        }))
                      }
                    />
                    <Input
                      id={`sale-price-${index}`}
                      className="h-10 text-right"
                      aria-label={`${index + 1}번 옵션 할인가`}
                      inputMode="numeric"
                      placeholder="0"
                      value={formatPrice(option.salePrice)}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          options: current.options.map((item, itemIndex) =>
                            itemIndex === index
                              ? {
                                  ...item,
                                  salePrice: event.target.value.replace(
                                    /\D/gu,
                                    "",
                                  ),
                                }
                              : item,
                          ),
                        }))
                      }
                    />
                    <Badge
                      variant="outline"
                      className="h-8 justify-center font-mono text-xs"
                    >
                      {formatDiscountRate(option.listPrice, option.salePrice)}
                    </Badge>
                    <Input
                      id={`group-chat-link-${index}`}
                      className="h-10"
                      aria-label={`${index + 1}번 옵션 단톡방 주소`}
                      type="url"
                      placeholder="https://open.kakao.com/o/..."
                      value={option.groupChatLink}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          options: current.options.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, groupChatLink: event.target.value }
                              : item,
                          ),
                        }))
                      }
                    />
                    <Input
                      id={`entry-code-${index}`}
                      className="h-10"
                      aria-label={`${index + 1}번 옵션 입장코드`}
                      placeholder="4~6글자"
                      maxLength={6}
                      value={option.entryCode}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          options: current.options.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, entryCode: event.target.value }
                              : item,
                          ),
                        }))
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      aria-label={`${index + 1}번 옵션 삭제`}
                      disabled={draft.options.length === 1}
                      onClick={() =>
                        setDraft((current) => ({
                          ...current,
                          options: current.options.filter(
                            (_, itemIndex) => itemIndex !== index,
                          ),
                        }))
                      }
                    >
                      <Trash2 />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>유튜브 출연</CardTitle>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setDraft((current) => ({
                    ...current,
                    youtubeAppearances: [
                      ...current.youtubeAppearances,
                      { channelName: "", channelUrl: "", videoUrl: "" },
                    ],
                  }))
                }
              >
                <Plus />
                출연 추가
              </Button>
            </div>
            <CardDescription>
              출연 예정 채널과 게시 완료된 영상 주소를 기록합니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {draft.youtubeAppearances.length === 0 ? (
              <div className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">
                아직 등록된 유튜브 출연 정보가 없습니다.
              </div>
            ) : (
              <div className="overflow-x-auto pb-1">
                <div className="min-w-[900px] space-y-2">
                  <div className="grid grid-cols-[180px_minmax(250px,1fr)_minmax(250px,1fr)_72px_44px] items-center gap-2 px-1 text-xs font-medium text-muted-foreground">
                    <span>채널명</span>
                    <span>채널 주소</span>
                    <span>게시된 영상 주소</span>
                    <span className="sr-only">링크 열기</span>
                    <span className="sr-only">삭제</span>
                  </div>
                  {draft.youtubeAppearances.map((appearance, index) => (
                    <div
                      key={`youtube-${index}`}
                      className="grid grid-cols-[180px_minmax(250px,1fr)_minmax(250px,1fr)_72px_44px] items-center gap-2"
                    >
                      <Input
                        id={`channel-name-${index}`}
                        className="h-10"
                        aria-label={`${index + 1}번 유튜브 채널명`}
                        placeholder="채널명"
                        value={appearance.channelName}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            youtubeAppearances: current.youtubeAppearances.map(
                              (item, itemIndex) =>
                                itemIndex === index
                                  ? {
                                      ...item,
                                      channelName: event.target.value,
                                    }
                                  : item,
                            ),
                          }))
                        }
                      />
                      <Input
                        id={`channel-url-${index}`}
                        className="h-10"
                        aria-label={`${index + 1}번 유튜브 채널 주소`}
                        type="url"
                        placeholder="https://youtube.com/@channel"
                        value={appearance.channelUrl}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            youtubeAppearances: current.youtubeAppearances.map(
                              (item, itemIndex) =>
                                itemIndex === index
                                  ? {
                                      ...item,
                                      channelUrl: event.target.value,
                                    }
                                  : item,
                            ),
                          }))
                        }
                      />
                      <Input
                        id={`video-url-${index}`}
                        className="h-10"
                        aria-label={`${index + 1}번 게시 영상 주소`}
                        type="url"
                        placeholder="https://youtube.com/watch?v=..."
                        value={appearance.videoUrl}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            youtubeAppearances: current.youtubeAppearances.map(
                              (item, itemIndex) =>
                                itemIndex === index
                                  ? {
                                      ...item,
                                      videoUrl: event.target.value,
                                    }
                                  : item,
                            ),
                          }))
                        }
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={!appearance.videoUrl}
                        asChild={Boolean(appearance.videoUrl)}
                      >
                        {appearance.videoUrl ? (
                          <a
                            href={appearance.videoUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <ExternalLink />
                            열기
                          </a>
                        ) : (
                          <span>열기</span>
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        aria-label={`${index + 1}번 유튜브 출연 삭제`}
                        onClick={() =>
                          setDraft((current) => ({
                            ...current,
                            youtubeAppearances:
                              current.youtubeAppearances.filter(
                                (_, itemIndex) => itemIndex !== index,
                              ),
                          }))
                        }
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {courseId ? (
        <CourseRosterSections
          rosterJobs={rosterJobs}
          selectedRosterIds={draft.rosterJobIds}
          onRosterIdsChange={(rosterJobIds) =>
            setDraft((current) => ({ ...current, rosterJobIds }))
          }
          addressBooks={addressBooks}
          paidStudentPreview={paidStudentPreview}
          paidRosterAnalysis={paidRosterAnalysis}
          freeStudentPreview={freeStudentPreview}
          freeAddressBookId={draft.freeAddressBookId}
          onFreeAddressBookChange={(freeAddressBookId) =>
            setDraft((current) => ({ ...current, freeAddressBookId }))
          }
        />
      ) : null}

      <div className="flex justify-end border-t pt-6">
        <Button className="min-h-10" onClick={saveCourse} disabled={saving}>
          {saving ? <Loader2 className="animate-spin" /> : <Save />}
          {saving ? "저장 중" : courseId ? "변경사항 저장" : "강의 만들기"}
        </Button>
      </div>
    </div>
  );
}
