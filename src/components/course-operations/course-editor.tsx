"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  Loader2,
  MessageSquareText,
  Plus,
  Save,
  Trash2,
} from "lucide-react";

import { CourseRosterSections } from "@/components/course-operations/course-roster-sections";
import { CourseNotesCard } from "@/components/course-operations/course-notes-card";
import { CourseScheduleCalendar } from "@/components/course-operations/course-schedule-calendar";
import { CourseShareDialog } from "@/components/course-operations/course-share-dialog";
import { CourseSettlementManager } from "@/components/course-settlements/course-settlement-manager";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import type {
  AddressBookSummary,
  CourseRosterAnalysis,
  CourseMessageContentData,
  CourseSalesSectionData,
  CourseMessagesSectionData,
  CourseStudentsSectionData,
  CourseStudentPreview,
  CourseOperationsDraft,
  CourseVideosSectionData,
  FreeStudentPreview,
  LinkableMessageProject,
  LinkableRosterJob,
  YoutubeChannelSuggestion,
} from "@/lib/course-operations/types";
import type { CourseNote } from "@/lib/course-operations/notes";
import { decodeReadableUrl } from "@/lib/course-operations/youtube-channels";
import { calculateDiscountRate } from "@/lib/course-operations/pricing";
import {
  koreaDateTimeToIso,
  koreaDateToIso,
  toKoreaDate,
  toWebinarTime,
  WEBINAR_TIME_OPTIONS,
} from "@/lib/course-operations/schedule";
import {
  applyTaskDeadlines,
  formatDeadlineDate,
  getDeadlineProgress,
  TASK_DEADLINE_WEEKS,
} from "@/lib/course-operations/task-deadlines";

function formatPrice(value: string) {
  const digits = value.replace(/\D/gu, "");
  return digits ? Number(digits).toLocaleString("ko-KR") : "";
}

function formatDiscountRate(listPrice: string, salePrice: string) {
  const rate = calculateDiscountRate(listPrice, salePrice);
  return rate === null ? "-" : `${rate}%`;
}

type CourseLinkFieldKey =
  | "landingPageLink"
  | "freeKakaoRoom1Link"
  | "freeKakaoRoom2Link"
  | "communicationRoomLink"
  | "paymentLink"
  | "inquiryLink"
  | "curriculumLink"
  | "freeGiftLink"
  | "courseViewingLink";

const COURSE_LINKS: Array<{ field: CourseLinkFieldKey; label: string }> = [
  { field: "landingPageLink", label: "기본 랜딩페이지" },
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

type CourseEditorTab =
  | "information"
  | "sales"
  | "students"
  | "messages"
  | "videos"
  | "settlement";
type DeferredCourseEditorTab = Exclude<CourseEditorTab, "information" | "settlement">;
type SectionLoadStatus = "idle" | "loading" | "loaded" | "error";

function DeferredSectionState({
  status,
  error,
  onRetry,
}: {
  status: SectionLoadStatus;
  error?: string;
  onRetry: () => void;
}) {
  if (status === "error") {
    return (
      <div className="flex min-h-52 flex-col items-center justify-center rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
        <p className="font-medium text-destructive">상세 정보를 불러오지 못했습니다</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {error || "잠시 후 다시 시도해 주세요."}
        </p>
        <Button type="button" variant="outline" className="mt-4" onClick={onRetry}>
          다시 불러오기
        </Button>
      </div>
    );
  }

  return (
    <div
      className="flex min-h-52 items-center justify-center rounded-xl border border-dashed"
      aria-busy="true"
    >
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="animate-spin" />
        상세 정보를 불러오는 중입니다.
      </div>
    </div>
  );
}

function CourseCustomLinkInput({
  index,
  name,
  url,
  onChange,
  onDelete,
}: {
  index: number;
  name: string;
  url: string;
  onChange: (index: number, patch: { name?: string; url?: string }) => void;
  onDelete: (index: number) => void;
}) {
  const openableLink = getOpenableLink(url);
  return (
    <TableRow>
      <TableCell className="w-[180px]">
        <Input
          className="h-10"
          aria-label={`${index + 1}번 커스텀 링크 이름`}
          placeholder="링크 이름"
          maxLength={100}
          value={name}
          onChange={(event) => onChange(index, { name: event.target.value })}
        />
      </TableCell>
      <TableCell>
        <Input
          className="h-10 min-w-[320px]"
          type="url"
          inputMode="url"
          aria-label={`${index + 1}번 커스텀 링크 주소`}
          placeholder="https://"
          maxLength={2_000}
          value={url}
          onChange={(event) => onChange(index, { url: event.target.value })}
        />
      </TableCell>
      <TableCell className="w-[150px]">
        <div className="flex justify-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-10 w-10"
            aria-label={`${name || `${index + 1}번 커스텀 링크`} 열기`}
            disabled={!openableLink}
            asChild={Boolean(openableLink)}
          >
            {openableLink ? (
              <a href={openableLink} target="_blank" rel="noopener noreferrer">
                <ExternalLink />
              </a>
            ) : (
              <span>
                <ExternalLink />
              </span>
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-10 w-10 text-destructive hover:text-destructive"
            aria-label={`${name || `${index + 1}번 커스텀 링크`} 삭제`}
            onClick={() => onDelete(index)}
          >
            <Trash2 />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

export function CourseOperationsEditor({
  courseId,
  initialDraft,
  rosterJobs = [],
  messageProjects = [],
  addressBooks = [],
  youtubeChannelSuggestions = [],
  paidStudentPreview = [],
  paidRosterAnalysis,
  freeStudentPreview = [],
  currentUserId = "",
  currentUserEmail = "",
  initialNotes = [],
  notesLoadError,
  loadError,
  deferDetailSections = false,
  initialTab = "information",
}: {
  courseId?: string;
  initialDraft: CourseOperationsDraft;
  rosterJobs?: LinkableRosterJob[];
  messageProjects?: LinkableMessageProject[];
  addressBooks?: AddressBookSummary[];
  youtubeChannelSuggestions?: YoutubeChannelSuggestion[];
  paidStudentPreview?: CourseStudentPreview[];
  paidRosterAnalysis?: CourseRosterAnalysis;
  freeStudentPreview?: FreeStudentPreview[];
  currentUserId?: string;
  currentUserEmail?: string;
  initialNotes?: CourseNote[];
  notesLoadError?: string;
  loadError?: string;
  deferDetailSections?: boolean;
  initialTab?: "information" | "settlement";
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(() => {
    const freeWebinarAt = toKoreaDate(initialDraft.freeWebinarAt);
    return {
      ...initialDraft,
      messageProjectIds: initialDraft.messageProjectIds.slice(0, 1),
      freeWebinarAt,
      freeWebinarTime: toWebinarTime(initialDraft.freeWebinarAt),
      startsAt: toKoreaDate(initialDraft.startsAt),
      requiredTasks: applyTaskDeadlines(
        initialDraft.requiredTasks,
        freeWebinarAt,
      ),
    };
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [copiedMessagePosition, setCopiedMessagePosition] = useState<
    number | null
  >(null);
  const [notice, setNotice] = useState("");
  const [activeTab, setActiveTab] = useState<CourseEditorTab>(initialTab);
  const [loadedRosterJobs, setLoadedRosterJobs] = useState(rosterJobs);
  const [loadedMessageProjects, setLoadedMessageProjects] =
    useState(messageProjects);
  const [messageContentLoadingId, setMessageContentLoadingId] = useState("");
  const [loadedAddressBooks, setLoadedAddressBooks] = useState(addressBooks);
  const [loadedYoutubeChannelSuggestions, setLoadedYoutubeChannelSuggestions] =
    useState(youtubeChannelSuggestions);
  const [loadedPaidStudentPreview, setLoadedPaidStudentPreview] =
    useState(paidStudentPreview);
  const [loadedPaidRosterAnalysis, setLoadedPaidRosterAnalysis] =
    useState(paidRosterAnalysis);
  const [loadedFreeStudentPreview, setLoadedFreeStudentPreview] =
    useState(freeStudentPreview);
  const [sectionStatuses, setSectionStatuses] = useState<
    Record<DeferredCourseEditorTab, SectionLoadStatus>
  >(() => ({
    sales: deferDetailSections ? "idle" : "loaded",
    students: deferDetailSections ? "idle" : "loaded",
    messages: deferDetailSections ? "idle" : "loaded",
    videos: deferDetailSections ? "idle" : "loaded",
  }));
  const [sectionErrors, setSectionErrors] = useState<
    Partial<Record<DeferredCourseEditorTab, string>>
  >({});
  const loadingSectionsRef = useRef(new Set<DeferredCourseEditorTab>());

  async function loadDetailSection(section: DeferredCourseEditorTab) {
    if (
      !courseId ||
      !deferDetailSections ||
      sectionStatuses[section] === "loaded" ||
      loadingSectionsRef.current.has(section)
    ) return;

    loadingSectionsRef.current.add(section);
    setSectionStatuses((current) => ({ ...current, [section]: "loading" }));
    setSectionErrors((current) => ({ ...current, [section]: undefined }));

    try {
      const selectedMessageProjectId = draft.messageProjectIds[0] ?? "";
      const query = new URLSearchParams({ section });
      if (section === "messages" && selectedMessageProjectId) {
        query.set("messageProjectId", selectedMessageProjectId);
      }
      const response = await fetch(
        `/api/course-operations/${courseId}?${query.toString()}`,
        { cache: "no-store" },
      );
      const body = (await response.json()) as
        | CourseSalesSectionData
        | CourseStudentsSectionData
        | CourseMessagesSectionData
        | CourseVideosSectionData
        | { message?: string };
      if (!response.ok) {
        throw new Error(
          "message" in body && body.message
            ? body.message
            : "상세 정보를 불러오지 못했습니다.",
        );
      }

      if (section === "sales") {
        const sales = body as CourseSalesSectionData;
        setDraft((current) => ({
          ...current,
          earlyBirdEvent: sales.earlyBirdEvent,
          first50Event: sales.first50Event,
          options: sales.options,
        }));
      } else if (section === "students") {
        const students = body as CourseStudentsSectionData;
        setLoadedRosterJobs(students.rosterJobs);
        setLoadedAddressBooks(students.addressBooks);
        setLoadedPaidStudentPreview(students.paidStudentPreview);
        setLoadedPaidRosterAnalysis(students.paidRosterAnalysis);
        setLoadedFreeStudentPreview(students.freeStudentPreview);
      } else if (section === "messages") {
        setLoadedMessageProjects(
          (body as CourseMessagesSectionData).messageProjects,
        );
      } else {
        const videos = body as CourseVideosSectionData;
        setLoadedYoutubeChannelSuggestions(videos.youtubeChannelSuggestions);
        setDraft((current) => ({
          ...current,
          youtubeAppearances: videos.youtubeAppearances,
          liveVideos: videos.liveVideos,
        }));
      }
      setSectionStatuses((current) => ({
        ...current,
        [section]: "loaded",
      }));
    } catch (reason: unknown) {
      setSectionErrors((current) => ({
        ...current,
        [section]:
          reason instanceof Error
            ? reason.message
            : "상세 정보를 불러오지 못했습니다.",
      }));
      setSectionStatuses((current) => ({
        ...current,
        [section]: "error",
      }));
    } finally {
      loadingSectionsRef.current.delete(section);
    }
  }

  function changeTab(value: string) {
    const nextTab = value as CourseEditorTab;
    setActiveTab(nextTab);
    if (nextTab !== "information" && nextTab !== "settlement") {
      void loadDetailSection(nextTab);
    }
  }

  async function selectMessageProject(messageProjectId: string) {
    setDraft((current) => ({
      ...current,
      messageProjectIds: [messageProjectId],
    }));
    const project = loadedMessageProjects.find(
      (item) => item.id === messageProjectId,
    );
    if (!courseId || project?.resources_loaded) return;

    setMessageContentLoadingId(messageProjectId);
    try {
      const query = new URLSearchParams({
        section: "message-content",
        messageProjectId,
      });
      const response = await fetch(
        `/api/course-operations/${courseId}?${query.toString()}`,
        { cache: "no-store" },
      );
      const body = (await response.json()) as
        | CourseMessageContentData
        | { message?: string };
      if (!response.ok) {
        throw new Error(
          "message" in body && body.message
            ? body.message
            : "문자 내용을 불러오지 못했습니다.",
        );
      }
      const content = body as CourseMessageContentData;
      setLoadedMessageProjects((current) =>
        current.map((item) =>
          item.id === content.projectId
            ? {
                ...item,
                resources_loaded: true,
                message_studio_resources: content.resources,
              }
            : item,
        ),
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "문자 내용을 불러오지 못했습니다.",
      );
    } finally {
      setMessageContentLoadingId("");
    }
  }

  function retrySection(section: DeferredCourseEditorTab) {
    void loadDetailSection(section);
  }

  const uniqueChannelNames = useMemo(
    () =>
      loadedYoutubeChannelSuggestions.filter(
        (suggestion, index, suggestions) =>
          suggestion.channelName &&
          suggestions.findIndex(
            (item) => item.channelName === suggestion.channelName,
          ) === index,
      ),
    [loadedYoutubeChannelSuggestions],
  );
  const uniqueChannelUrls = useMemo(
    () =>
      loadedYoutubeChannelSuggestions.filter(
        (suggestion, index, suggestions) =>
          suggestion.channelUrl &&
          suggestions.findIndex(
            (item) => item.channelUrl === suggestion.channelUrl,
          ) === index,
      ),
    [loadedYoutubeChannelSuggestions],
  );

  function updateField(
    field: Exclude<
      keyof CourseOperationsDraft,
      | "options"
      | "youtubeAppearances"
      | "liveVideos"
      | "rosterJobIds"
      | "messageProjectIds"
      | "customLinks"
      | "requiredTasks"
    >,
    value: string,
  ) {
    setDraft((current) => ({
      ...current,
      [field]: value,
      ...(field === "freeWebinarAt"
        ? { requiredTasks: applyTaskDeadlines(current.requiredTasks, value) }
        : {}),
    }));
  }

  function addCustomLink() {
    setDraft((current) => ({
      ...current,
      customLinks: [...current.customLinks, { name: "", url: "" }],
    }));
  }

  function updateCustomLink(
    index: number,
    patch: { name?: string; url?: string },
  ) {
    setDraft((current) => ({
      ...current,
      customLinks: current.customLinks.map((link, linkIndex) =>
        linkIndex === index ? { ...link, ...patch } : link,
      ),
    }));
  }

  function deleteCustomLink(index: number) {
    setDraft((current) => ({
      ...current,
      customLinks: current.customLinks.filter(
        (_, linkIndex) => linkIndex !== index,
      ),
    }));
  }

  function updateRequiredTask(
    key: CourseOperationsDraft["requiredTasks"][number]["key"],
    patch: Partial<
      Pick<
        CourseOperationsDraft["requiredTasks"][number],
        "dueDate" | "completed"
      >
    >,
  ) {
    setDraft((current) => ({
      ...current,
      requiredTasks: current.requiredTasks.map((task) =>
        task.key === key ? { ...task, ...patch } : task,
      ),
    }));
  }

  function updateYoutubeAppearance(
    index: number,
    patch: Partial<CourseOperationsDraft["youtubeAppearances"][number]>,
  ) {
    setDraft((current) => ({
      ...current,
      youtubeAppearances: current.youtubeAppearances.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    }));
  }

  function updateLiveVideo(
    index: number,
    patch: Partial<CourseOperationsDraft["liveVideos"][number]>,
  ) {
    setDraft((current) => ({
      ...current,
      liveVideos: current.liveVideos.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    }));
  }

  function updateYoutubeChannelName(index: number, channelName: string) {
    const selected = loadedYoutubeChannelSuggestions.find(
      (suggestion) => suggestion.channelName === channelName,
    );
    updateYoutubeAppearance(index, {
      channelName,
      ...(selected?.channelUrl ? { channelUrl: selected.channelUrl } : {}),
    });
  }

  function updateYoutubeChannelUrl(index: number, channelUrl: string) {
    const readableUrl = decodeReadableUrl(channelUrl);
    const selected = loadedYoutubeChannelSuggestions.find(
      (suggestion) => suggestion.channelUrl === readableUrl,
    );
    updateYoutubeAppearance(index, {
      channelUrl: readableUrl,
      ...(selected?.channelName ? { channelName: selected.channelName } : {}),
    });
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
            loadedDetailSections: {
              sales: sectionStatuses.sales === "loaded",
              videos: sectionStatuses.videos === "loaded",
            },
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

  async function copyMessage(position: number, message: string) {
    try {
      await navigator.clipboard.writeText(message);
      setCopiedMessagePosition(position);
      window.setTimeout(() => {
        setCopiedMessagePosition((current) =>
          current === position ? null : current,
        );
      }, 1200);
    } catch {
      setError("문자 내용을 복사하지 못했습니다. 다시 시도해 주세요.");
    }
  }

  const selectedMessageProject = loadedMessageProjects.find(
    (project) => project.id === draft.messageProjectIds[0],
  );
  const selectedMessageGeneratedCount = selectedMessageProject
    ? (selectedMessageProject.generated_count ??
      selectedMessageProject.message_studio_resources.filter((resource) =>
        resource.generated_text.trim(),
      ).length)
    : 0;
  const selectedMessageResources = selectedMessageProject
    ? selectedMessageProject.message_studio_resources
        .filter((resource) => resource.generated_text.trim())
        .toSorted((left, right) => left.position - right.position)
    : [];
  const courseMaterialsOpenableLink = getOpenableLink(
    draft.courseMaterialsLink,
  );

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
          <CourseShareDialog
            data={{
              name: draft.name,
              instructorName: draft.instructorName,
              freeWebinarDate: draft.freeWebinarAt,
              freeWebinarTime: draft.freeWebinarTime,
              startsDate: draft.startsAt,
              earlyBirdEvent: draft.earlyBirdEvent,
              first50Event: draft.first50Event,
              landingPageLink: draft.landingPageLink,
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

      <Tabs
        value={activeTab}
        onValueChange={changeTab}
        className="gap-6"
      >
        <TabsList className="grid h-auto w-full grid-cols-3 sm:w-fit sm:grid-cols-6">
          <TabsTrigger value="information" className="min-h-10 px-2 sm:min-w-28 sm:px-5">
            정보
          </TabsTrigger>
          <TabsTrigger value="sales" className="min-h-10 px-2 sm:min-w-28 sm:px-5">
            판매 조건
          </TabsTrigger>
          <TabsTrigger value="students" className="min-h-10 px-2 sm:min-w-32 sm:px-5">
            수강생명단
          </TabsTrigger>
          <TabsTrigger value="messages" className="min-h-10 px-2 sm:min-w-32 sm:px-5">
            단톡방문자
          </TabsTrigger>
          <TabsTrigger value="videos" className="min-h-10 px-2 sm:min-w-28 sm:px-5">
            영상
          </TabsTrigger>
          <TabsTrigger
            value="settlement"
            disabled={!courseId}
            className="min-h-10 px-2 sm:min-w-28 sm:px-5"
          >
            정산
          </TabsTrigger>
        </TabsList>

        <TabsContent value="information" className="mt-0 space-y-6">
          <div className="grid items-stretch gap-6 xl:grid-cols-2">
          <div className="space-y-6">
            <Card>
            <CardHeader>
              <CardTitle>기본 정보와 일정</CardTitle>
              <CardDescription>
                강의를 식별하고 운영할 기본 정보입니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5 md:grid-cols-2">
              <div className="grid gap-2 md:col-span-2">
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
              <div className="grid gap-2">
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
                  <SelectTrigger
                    id="free-webinar-time"
                    className="h-10 w-full"
                  >
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
              <div className="grid gap-2 md:col-span-2">
                <Label htmlFor="course-materials-link">강의자료 링크</Label>
                <div className="flex gap-2">
                  <Input
                    id="course-materials-link"
                    className="h-10 min-w-0 flex-1"
                    type="url"
                    inputMode="url"
                    placeholder="https://"
                    maxLength={2_000}
                    value={draft.courseMaterialsLink}
                    onChange={(event) =>
                      updateField("courseMaterialsLink", event.target.value)
                    }
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10"
                    disabled={!courseMaterialsOpenableLink}
                    asChild={Boolean(courseMaterialsOpenableLink)}
                  >
                    {courseMaterialsOpenableLink ? (
                      <a
                        href={courseMaterialsOpenableLink}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink />
                        바로 열기
                      </a>
                    ) : (
                      <span>
                        <ExternalLink />
                        바로 열기
                      </span>
                    )}
                  </Button>
                </div>
              </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>필수 작업 목록</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>제목</TableHead>
                      <TableHead className="w-[130px]">완료 여부</TableHead>
                      <TableHead className="w-[190px]">데드라인</TableHead>
                      <TableHead className="w-[170px]">남은 기간</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {draft.requiredTasks.map((task) => {
                      const progress = getDeadlineProgress(
                        task.dueDate,
                        task.completed,
                      );
                      return (
                      <TableRow key={task.key}>
                        <TableCell
                          className={
                            task.completed
                              ? "text-muted-foreground line-through"
                              : "font-medium"
                          }
                        >
                          {task.title}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Checkbox
                              id={`required-task-${task.key}`}
                              className="size-5"
                              checked={task.completed}
                              onCheckedChange={(checked) =>
                                updateRequiredTask(task.key, {
                                  completed: checked === true,
                                })
                              }
                            />
                            <Label htmlFor={`required-task-${task.key}`}>
                              {task.completed ? "작업 완료" : "진행 중"}
                            </Label>
                          </div>
                        </TableCell>
                        <TableCell>
                          <p className="font-medium tabular-nums">
                            {formatDeadlineDate(task.dueDate)}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            무료 웨비나 {TASK_DEADLINE_WEEKS[task.key]}주 전
                          </p>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              progress.state === "overdue"
                                ? "destructive"
                                : progress.state === "complete"
                                  ? "secondary"
                                  : "outline"
                            }
                          >
                            {progress.label}
                          </Badge>
                        </TableCell>
                      </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          <Card className="h-full">
            <CardHeader>
              <CardTitle>강의 일정 달력</CardTitle>
            </CardHeader>
            <CardContent>
              <CourseScheduleCalendar
                courseName={draft.name || "강의명 미입력"}
                freeWebinarDate={draft.freeWebinarAt}
                freeWebinarTime={draft.freeWebinarTime}
                startsDate={draft.startsAt}
                requiredTasks={draft.requiredTasks}
              />
            </CardContent>
          </Card>
        </div>

        {courseId ? (
          <CourseNotesCard
            courseId={courseId}
            currentUserId={currentUserId}
            currentUserEmail={currentUserEmail}
            initialNotes={initialNotes}
            loadError={notesLoadError}
          />
        ) : null}

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>링크 관리</CardTitle>
              <CardDescription className="mt-1">
                카톡방·웨비나·강의 링크와 직접 만든 링크를 한 목록에서 관리합니다.
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              className="h-10 shrink-0"
              disabled={draft.customLinks.length >= 30}
              onClick={addCustomLink}
            >
              <Plus />
              커스텀 링크 추가
            </Button>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table className="min-w-[720px]">
              <TableHeader>
                <TableRow>
                  <TableHead>이름</TableHead>
                  <TableHead>링크</TableHead>
                  <TableHead className="text-center">관리</TableHead>
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
                {draft.customLinks.map((link, index) => (
                  <CourseCustomLinkInput
                    key={index}
                    index={index}
                    name={link.name}
                    url={link.url}
                    onChange={updateCustomLink}
                    onDelete={deleteCustomLink}
                  />
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        </TabsContent>

        <TabsContent value="sales" className="mt-0 space-y-6">
          {sectionStatuses.sales !== "loaded" ? (
            <DeferredSectionState
              status={sectionStatuses.sales}
              error={sectionErrors.sales}
              onRetry={() => retrySection("sales")}
            />
          ) : (
            <div className="space-y-6">

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
              필요한 경우에만 옵션별 정가와 실제 판매 할인가를 입력합니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="pb-1">
              <div className="space-y-2">
                {draft.options.length > 0 ? (
                  <div className="hidden grid-cols-[minmax(120px,0.8fr)_110px_110px_64px_minmax(180px,1fr)_90px_44px] items-center gap-2 px-1 text-xs font-medium text-muted-foreground lg:grid">
                    <span>옵션명</span>
                    <span>정가</span>
                    <span>할인가</span>
                    <span>할인율</span>
                    <span>단톡방 주소</span>
                    <span>입장코드</span>
                    <span className="sr-only">삭제</span>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                    등록된 옵션이 없습니다. 옵션 없이도 강의를 만들 수 있습니다.
                  </div>
                )}
                {draft.options.map((option, index) => (
                  <div
                    key={`option-${index}`}
                    className="grid grid-cols-1 items-center gap-2 lg:grid-cols-[minmax(120px,0.8fr)_110px_110px_64px_minmax(180px,1fr)_90px_44px]"
                  >
                    <Input
                      id={`option-name-${index}`}
                      className="h-10 text-sm"
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

            </div>
          )}
        </TabsContent>

        <TabsContent value="videos" className="mt-0">
          {sectionStatuses.videos !== "loaded" ? (
            <DeferredSectionState
              status={sectionStatuses.videos}
              error={sectionErrors.videos}
              onRetry={() => retrySection("videos")}
            />
          ) : (
          <div className="space-y-6">
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
            <datalist id="youtube-channel-name-suggestions">
              {uniqueChannelNames.map((suggestion) => (
                <option
                  key={`${suggestion.channelName}-${suggestion.channelUrl}`}
                  value={suggestion.channelName}
                  label={suggestion.channelUrl}
                />
              ))}
            </datalist>
            <datalist id="youtube-channel-url-suggestions">
              {uniqueChannelUrls.map((suggestion) => (
                <option
                  key={`${suggestion.channelUrl}-${suggestion.channelName}`}
                  value={suggestion.channelUrl}
                  label={suggestion.channelName}
                />
              ))}
            </datalist>
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
                        list="youtube-channel-name-suggestions"
                        autoComplete="off"
                        value={appearance.channelName}
                        onChange={(event) =>
                          updateYoutubeChannelName(index, event.target.value)
                        }
                      />
                      <Input
                        id={`channel-url-${index}`}
                        className="h-10"
                        aria-label={`${index + 1}번 유튜브 채널 주소`}
                        type="url"
                        placeholder="https://youtube.com/@channel"
                        list="youtube-channel-url-suggestions"
                        autoComplete="off"
                        value={appearance.channelUrl}
                        onChange={(event) =>
                          updateYoutubeAppearance(index, {
                            channelUrl: event.target.value,
                          })
                        }
                        onBlur={(event) =>
                          updateYoutubeChannelUrl(index, event.target.value)
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

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>기존 라이브 영상 링크</CardTitle>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setDraft((current) => ({
                    ...current,
                    liveVideos: [
                      ...current.liveVideos,
                      { name: "", videoUrl: "", note: "" },
                    ],
                  }))
                }
              >
                <Plus />
                영상 추가
              </Button>
            </div>
            <CardDescription>
              이전 라이브 영상의 이름, 주소와 비고를 기록합니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {draft.liveVideos.length === 0 ? (
              <div className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">
                아직 등록된 라이브 영상 링크가 없습니다.
              </div>
            ) : (
              <div className="overflow-x-auto pb-1">
                <div className="min-w-[900px] space-y-2">
                  <div className="grid grid-cols-[220px_minmax(280px,1fr)_minmax(220px,1fr)_72px_44px] items-center gap-2 px-1 text-xs font-medium text-muted-foreground">
                    <span>이름</span>
                    <span>주소</span>
                    <span>비고</span>
                    <span className="sr-only">링크 열기</span>
                    <span className="sr-only">삭제</span>
                  </div>
                  {draft.liveVideos.map((liveVideo, index) => {
                    const openableUrl = getOpenableLink(liveVideo.videoUrl);
                    return (
                      <div
                        key={`live-video-${index}`}
                        className="grid grid-cols-[220px_minmax(280px,1fr)_minmax(220px,1fr)_72px_44px] items-center gap-2"
                      >
                        <Input
                          id={`live-video-name-${index}`}
                          className="h-10"
                          aria-label={`${index + 1}번 라이브 영상 이름`}
                          placeholder="영상 이름"
                          maxLength={200}
                          value={liveVideo.name}
                          onChange={(event) =>
                            updateLiveVideo(index, { name: event.target.value })
                          }
                        />
                        <Input
                          id={`live-video-url-${index}`}
                          className="h-10"
                          aria-label={`${index + 1}번 라이브 영상 주소`}
                          type="url"
                          inputMode="url"
                          placeholder="https://"
                          maxLength={2_000}
                          value={liveVideo.videoUrl}
                          onChange={(event) =>
                            updateLiveVideo(index, { videoUrl: event.target.value })
                          }
                        />
                        <Input
                          id={`live-video-note-${index}`}
                          className="h-10"
                          aria-label={`${index + 1}번 라이브 영상 비고`}
                          placeholder="비고"
                          maxLength={500}
                          value={liveVideo.note}
                          onChange={(event) =>
                            updateLiveVideo(index, { note: event.target.value })
                          }
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={!openableUrl}
                          asChild={Boolean(openableUrl)}
                        >
                          {openableUrl ? (
                            <a
                              href={openableUrl}
                              target="_blank"
                              rel="noopener noreferrer"
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
                          aria-label={`${index + 1}번 라이브 영상 삭제`}
                          onClick={() =>
                            setDraft((current) => ({
                              ...current,
                              liveVideos: current.liveVideos.filter(
                                (_, itemIndex) => itemIndex !== index,
                              ),
                            }))
                          }
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
          </div>
          )}
        </TabsContent>

        <TabsContent value="students" className="mt-0">
          {sectionStatuses.students !== "loaded" ? (
            <DeferredSectionState
              status={sectionStatuses.students}
              error={sectionErrors.students}
              onRetry={() => retrySection("students")}
            />
          ) : (
          <CourseRosterSections
            rosterJobs={loadedRosterJobs}
            selectedRosterIds={draft.rosterJobIds}
            onRosterIdsChange={(rosterJobIds) =>
              setDraft((current) => ({ ...current, rosterJobIds }))
            }
            addressBooks={loadedAddressBooks}
            paidStudentPreview={loadedPaidStudentPreview}
            paidRosterAnalysis={loadedPaidRosterAnalysis}
            freeStudentPreview={loadedFreeStudentPreview}
            freeAddressBookId={draft.freeAddressBookId}
            onFreeAddressBookChange={(freeAddressBookId) =>
              setDraft((current) => ({ ...current, freeAddressBookId }))
            }
          />
          )}
        </TabsContent>

        <TabsContent value="messages" className="mt-0 space-y-6">
          {sectionStatuses.messages !== "loaded" ? (
            <DeferredSectionState
              status={sectionStatuses.messages}
              error={sectionErrors.messages}
              onRetry={() => retrySection("messages")}
            />
          ) : (
            <>
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
                {loadedMessageProjects.length === 0 ? (
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
                          void selectMessageProject(messageProjectId)
                        }
                      >
                        <SelectTrigger id="message-project-select" className="w-full">
                          <SelectValue placeholder="연결할 문자 목록을 선택하세요" />
                        </SelectTrigger>
                        <SelectContent>
                          {loadedMessageProjects.map((project) => {
                            const generatedCount =
                              project.generated_count ??
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

            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle>연결된 문자 내용</CardTitle>
                    <CardDescription className="mt-1">
                      선택한 웨비나 문자 목록에 생성된 문구를 번호 순서대로 보여줍니다.
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {selectedMessageProject ? (
                      <Badge variant="secondary">
                        {selectedMessageResources.length}/30개
                      </Badge>
                    ) : null}
                    {selectedMessageProject &&
                    selectedMessageResources.length > 0 ? (
                      <Button variant="outline" size="sm" asChild>
                        <a
                          href={`/api/message-studio/projects/${selectedMessageProject.id}/export`}
                        >
                          <Download />
                          전체 엑셀 다운로드
                        </a>
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" disabled>
                        <Download />
                        전체 엑셀 다운로드
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {messageContentLoadingId === selectedMessageProject?.id ? (
                  <div className="flex min-h-36 items-center justify-center gap-2 rounded-xl border border-dashed text-sm text-muted-foreground">
                    <Loader2 className="animate-spin" />
                    문자 내용을 불러오는 중입니다.
                  </div>
                ) : !selectedMessageProject ? (
                  <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                    먼저 상단에서 문자 목록을 연결해 주세요.
                  </div>
                ) : selectedMessageResources.length === 0 ? (
                  <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                    연결된 목록에 생성된 문자가 없습니다.
                  </div>
                ) : (
                  <div className="grid gap-3 xl:grid-cols-2">
                    {selectedMessageResources.map((resource) => (
                      <article
                        key={`${selectedMessageProject.id}-${resource.position}`}
                        className="rounded-xl border bg-muted/20 p-4"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <Badge variant="outline">
                            {resource.position}번
                          </Badge>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            aria-label={`${resource.position}번 문자 복사`}
                            onClick={() =>
                              void copyMessage(
                                resource.position,
                                resource.generated_text,
                              )
                            }
                          >
                            {copiedMessagePosition === resource.position ? (
                              <Check />
                            ) : (
                              <Copy />
                            )}
                            {copiedMessagePosition === resource.position
                              ? "복사됨"
                              : "복사"}
                          </Button>
                        </div>
                        <p className="mt-3 whitespace-pre-wrap break-words leading-6">
                          {resource.generated_text}
                        </p>
                      </article>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="settlement" className="mt-0">
          {courseId ? (
            <CourseSettlementManager
              courseId={courseId}
              courseName={initialDraft.name}
              instructorName={initialDraft.instructorName}
            />
          ) : (
            <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
              강의를 먼저 만든 뒤 정산 자료를 등록할 수 있습니다.
            </div>
          )}
        </TabsContent>
      </Tabs>

      <div className="flex justify-end border-t pt-6">
        <Button className="min-h-10" onClick={saveCourse} disabled={saving}>
          {saving ? <Loader2 className="animate-spin" /> : <Save />}
          {saving ? "저장 중" : courseId ? "변경사항 저장" : "강의 만들기"}
        </Button>
      </div>
    </div>
  );
}
