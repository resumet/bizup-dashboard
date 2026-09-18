"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  ImagePlus,
  Loader2,
  MessageSquareText,
  Plus,
  Save,
  Trash2,
} from "lucide-react";

import { CourseRosterSections } from "@/components/course-operations/course-roster-sections";
import { CourseNotesCard } from "@/components/course-operations/course-notes-card";
import { CourseShareDialog } from "@/components/course-operations/course-share-dialog";
import { CourseSettlementManager } from "@/components/course-settlements/course-settlement-manager";
import { CourseCostManager } from "@/components/course-costs/course-cost-manager";
import { CourseOrdersManager } from "@/components/course-operations/course-orders-manager";
import { CourseWebinarEditor } from "@/components/course-operations/course-webinar-editor";
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
import {
  courseBannerUrl,
  validateCourseBannerFile,
} from "@/lib/course-operations/banner";
import { decodeReadableUrl } from "@/lib/course-operations/youtube-channels";
import {
  calculateDiscountRate,
  calculateEarlyBirdDiscountAmount,
  calculateTwelveMonthInstallment,
} from "@/lib/course-operations/pricing";
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

function formatCalculatedPrice(value: number | null, suffix = "??) {
  return value === null ? "-" : `${value.toLocaleString("ko-KR")}${suffix}`;
}

type CourseLinkFieldKey =
  | "landingPageLink"
  | "freeKakaoRoom1Link"
  | "freeKakaoRoom2Link"
  | "paidKakaoRoomLink"
  | "communicationRoomLink"
  | "paymentLink"
  | "inquiryLink"
  | "curriculumLink"
  | "freeGiftLink"
  | "courseViewingLink"
  | "courseMaterialsLink";

const COURSE_LINKS: Array<{ field: CourseLinkFieldKey; label: string }> = [
  { field: "landingPageLink", label: "ê¸°ë³¸ ?œë”©?˜ì´ì§€" },
  { field: "freeKakaoRoom1Link", label: "ë¬´ë£Œì¹´í†¡ë°?1ë²? },
  { field: "freeKakaoRoom2Link", label: "ë¬´ë£Œì¹´í†¡ë°?2ë²? },
  { field: "paidKakaoRoomLink", label: "? ë£Œ?˜ê°•?ë‹¨?¡ë°©" },
  { field: "communicationRoomLink", label: "?Œí†µë°? },
  { field: "paymentLink", label: "ê²°ì œë§í¬" },
  { field: "inquiryLink", label: "ë¬¸ì˜?˜ê¸° ë§í¬" },
  { field: "curriculumLink", label: "ì»¤ë¦¬?˜ëŸ¼ ë³´ê¸° ë§í¬" },
  { field: "freeGiftLink", label: "ë¬´ë£Œê°•ì˜ ?˜ê°• ? ë¬¼ë°›ê¸° ë§í¬" },
  { field: "courseViewingLink", label: "ê°•ì˜ ?œì²­?˜ê¸° ë§í¬" },
  { field: "courseMaterialsLink", label: "ê°•ì˜?ë£Œ ë§í¬" },
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
          onClick={() => {
            if (openableLink) window.open(openableLink, "_blank", "noopener,noreferrer");
          }}
        >
          <ExternalLink />
          ?´ê¸°
        </Button>
      </TableCell>
    </TableRow>
  );
}

type CourseEditorTab =
  | "webinar"
  | "information"
  | "sales"
  | "students"
  | "messages"
  | "videos"
  | "costs"
  | "orders"
  | "paid-students"
  | "settlement";
type DeferredCourseEditorTab = Exclude<CourseEditorTab, "information" | "costs" | "settlement" | "orders" | "webinar" | "paid-students">;
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
        <p className="font-medium text-destructive">?ì„¸ ?•ë³´ë¥?ë¶ˆëŸ¬?¤ì? ëª»í–ˆ?µë‹ˆ??/p>
        <p className="mt-1 text-sm text-muted-foreground">
          {error || "? ì‹œ ???¤ì‹œ ?œë„??ì£¼ì„¸??"}
        </p>
        <Button type="button" variant="outline" className="mt-4" onClick={onRetry}>
          ?¤ì‹œ ë¶ˆëŸ¬?¤ê¸°
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
        ?ì„¸ ?•ë³´ë¥?ë¶ˆëŸ¬?¤ëŠ” ì¤‘ì…?ˆë‹¤.
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
          aria-label={`${index + 1}ë²?ì»¤ìŠ¤?€ ë§í¬ ?´ë¦„`}
          placeholder="ë§í¬ ?´ë¦„"
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
          aria-label={`${index + 1}ë²?ì»¤ìŠ¤?€ ë§í¬ ì£¼ì†Œ`}
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
            aria-label={`${name || `${index + 1}ë²?ì»¤ìŠ¤?€ ë§í¬`} ?´ê¸°`}
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
            aria-label={`${name || `${index + 1}ë²?ì»¤ìŠ¤?€ ë§í¬`} ?? œ`}
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
  initialBannerUrl = "",
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
  paidRoster,
}: {
  courseId?: string;
  initialDraft: CourseOperationsDraft;
  initialBannerUrl?: string;
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
  initialTab?: "information" | "costs" | "settlement" | "orders" | "webinar" | "paid-students";
  paidRoster?: ReactNode;
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
  const [savedBannerUrl, setSavedBannerUrl] = useState(initialBannerUrl);
  const [bannerSelection, setBannerSelection] = useState<{
    file: File;
    previewUrl: string;
  } | null>(null);
  const [bannerRemoved, setBannerRemoved] = useState(false);
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
  const bannerInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const previewUrl = bannerSelection?.previewUrl;
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [bannerSelection]);

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
            : "?ì„¸ ?•ë³´ë¥?ë¶ˆëŸ¬?¤ì? ëª»í–ˆ?µë‹ˆ??",
        );
      }

      if (section === "sales") {
        const sales = body as CourseSalesSectionData;
        setDraft((current) => ({
          ...current,
          earlyBirdEvent: sales.earlyBirdEvent,
          first50Event: sales.first50Event,
          courseDifferentiation: sales.courseDifferentiation,
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
            : "?ì„¸ ?•ë³´ë¥?ë¶ˆëŸ¬?¤ì? ëª»í–ˆ?µë‹ˆ??",
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
    if (nextTab === "information") {
      void loadDetailSection("videos");
    } else if (nextTab !== "costs" && nextTab !== "settlement" && nextTab !== "orders" && nextTab !== "webinar" && nextTab !== "paid-students") {
      void loadDetailSection(nextTab);
    }
  }

  useEffect(() => {
    if (activeTab === "information") {
      void loadDetailSection("videos");
    }
    // loadDetailSection is intentionally recreated with the editor state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

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
            : "ë¬¸ì ?´ìš©??ë¶ˆëŸ¬?¤ì? ëª»í–ˆ?µë‹ˆ??",
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
          : "ë¬¸ì ?´ìš©??ë¶ˆëŸ¬?¤ì? ëª»í–ˆ?µë‹ˆ??",
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

  function selectBanner(file: File | undefined) {
    if (!file) return;
    try {
      validateCourseBannerFile(file);
      setError("");
      setBannerSelection({ file, previewUrl: URL.createObjectURL(file) });
      setBannerRemoved(false);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "ë°°ë„ˆ ?´ë?ì§€ë¥?? íƒ?˜ì? ëª»í–ˆ?µë‹ˆ??",
      );
    } finally {
      if (bannerInputRef.current) bannerInputRef.current.value = "";
    }
  }

  function removeBanner() {
    setBannerSelection(null);
    setBannerRemoved(true);
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
      const payload = {
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
      };
      const hasBannerMutation = Boolean(bannerSelection || bannerRemoved);
      const form = hasBannerMutation ? new FormData() : null;
      if (form) {
        form.set("course", JSON.stringify(payload));
        if (bannerSelection) form.set("banner", bannerSelection.file);
        if (bannerRemoved) form.set("removeBanner", "true");
      }
      const response = await fetch(
        courseId
          ? `/api/course-operations/${courseId}`
          : "/api/course-operations",
        {
          method: courseId ? "PATCH" : "POST",
          headers: form ? undefined : { "Content-Type": "application/json" },
          body: form ?? JSON.stringify(payload),
        },
      );
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.message ?? "ê°•ì˜ ?•ë³´ë¥??€?¥í•˜ì§€ ëª»í–ˆ?µë‹ˆ??");
      }
      if (!courseId) {
        router.push(`/services/course-operations/${body.id}`);
        return;
      }
      if (bannerSelection) {
        setSavedBannerUrl(courseBannerUrl(courseId, new Date().toISOString()));
      } else if (bannerRemoved) {
        setSavedBannerUrl("");
      }
      setBannerSelection(null);
      setBannerRemoved(false);
      setNotice("ê°•ì˜ ?•ë³´?€ ?°ê²° ??ª©???€?¥í–ˆ?µë‹ˆ??");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "ê°•ì˜ ?•ë³´ë¥??€?¥í•˜ì§€ ëª»í–ˆ?µë‹ˆ??",
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
      setError("ë¬¸ì ?´ìš©??ë³µì‚¬?˜ì? ëª»í–ˆ?µë‹ˆ?? ?¤ì‹œ ?œë„??ì£¼ì„¸??");
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
  const bannerPreviewUrl = bannerSelection?.previewUrl ??
    (bannerRemoved ? "" : savedBannerUrl);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <Badge variant="outline" className="mb-3 h-auto min-h-5 max-w-full whitespace-normal break-all">
            COURSE ID Â· {courseId ?? "?ì„± ??}
          </Badge>
          <h1 className="text-3xl font-semibold tracking-tight">
            {courseId
              ? draft.name
                ? `${draft.cohort ? `(${draft.cohort}ê¸? ` : ""}${draft.name}${draft.instructorName ? ` - ${draft.instructorName}` : ""}`
                : "ê°•ì˜ ?´ì˜ ?•ë³´"
              : "??ê°•ì˜ ë§Œë“¤ê¸?}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <CourseShareDialog
            onOpen={() => void loadDetailSection("videos")}
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
              paidKakaoRoomLink: draft.paidKakaoRoomLink,
              communicationRoomLink: draft.communicationRoomLink,
              paymentLink: draft.paymentLink,
              inquiryLink: draft.inquiryLink,
              curriculumLink: draft.curriculumLink,
              freeGiftLink: draft.freeGiftLink,
              courseViewingLink: draft.courseViewingLink,
              options: draft.options,
              youtubeAppearances: draft.youtubeAppearances,
              liveVideos: draft.liveVideos,
            }}
          />
          <Button className={activeTab === "webinar" ? "hidden" : "min-h-10"} onClick={saveCourse} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : <Save />}
            {saving ? "?€??ì¤? : courseId ? "ë³€ê²½ì‚¬???€?? : "ê°•ì˜ ë§Œë“¤ê¸?}
          </Button>
        </div>
      </div>

      {loadError ? (
        <Alert variant="destructive" className="fixed bottom-5 left-1/2 z-50 w-[min(92vw,32rem)] -translate-x-1/2 border-red-300 bg-red-50 text-red-950 shadow-lg">
          <AlertTitle>?°ê²° ??ª©??ëª¨ë‘ ë¶ˆëŸ¬?¤ì? ëª»í–ˆ?µë‹ˆ??/AlertTitle>
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      ) : null}
      {error ? (
        <Alert variant="destructive" className="fixed bottom-5 left-1/2 z-50 w-[min(92vw,32rem)] -translate-x-1/2 border-red-300 bg-red-50 text-red-950 shadow-lg">
          <AlertTitle>?€?¥í•  ???†ìŠµ?ˆë‹¤</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {notice ? (
        <Alert className="fixed bottom-5 left-1/2 z-50 w-[min(92vw,32rem)] -translate-x-1/2 border-sky-300 bg-sky-50 text-sky-950 shadow-lg">
          <AlertTitle>?€???„ë£Œ</AlertTitle>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      ) : null}

      <Tabs
        value={activeTab}
        onValueChange={changeTab}
        className="gap-6"
      >
        <TabsList className="grid w-full grid-cols-2 grid-rows-5 group-data-horizontal/tabs:h-[14rem] md:grid-cols-5 md:grid-rows-2 md:group-data-horizontal/tabs:h-[5.5rem] 2xl:grid-cols-10 2xl:grid-rows-1 2xl:group-data-horizontal/tabs:h-12">
          <TabsTrigger value="information" className="h-10 min-w-0 px-2 md:min-w-28 md:px-5">
            ?•ë³´
          </TabsTrigger>
          <TabsTrigger value="sales" className="h-10 min-w-0 px-2 md:min-w-28 md:px-5">
            ?ë§¤ ì¡°ê±´
          </TabsTrigger>
          <TabsTrigger value="students" className="h-10 min-w-0 px-2 md:min-w-32 md:px-5">
            ?˜ê°•?ëª…??
          </TabsTrigger>
          <TabsTrigger value="orders" disabled={!courseId} className="h-10 min-w-0 px-2 md:min-w-28 md:px-5">
            ì£¼ë¬¸ ?´ì—­
          </TabsTrigger>
          <TabsTrigger value="paid-students" disabled={!courseId} className="h-10 min-w-0 px-2">? ë£Œ?˜ê°•??/TabsTrigger>
          <TabsTrigger value="messages" className="h-10 min-w-0 px-2 md:min-w-32 md:px-5">
            ?¨í†¡ë°©ë¬¸??
          </TabsTrigger>
          <TabsTrigger value="webinar" disabled={!courseId} className="h-10 min-w-0 px-2">?¼ì´ë¸??¨ë¹„??/TabsTrigger>
          <TabsTrigger value="costs" disabled={!courseId} className="h-10 min-w-0 px-2 md:min-w-28 md:px-5">
            ë¹„ìš©
          </TabsTrigger>
          <TabsTrigger
            value="settlement"
            disabled={!courseId}
            className="h-10 min-w-0 px-2 md:min-w-28 md:px-5"
          >
            ?•ì‚°
          </TabsTrigger>
        </TabsList>

        <TabsContent value="information" className="mt-0 space-y-6">
          <div className="grid items-start gap-6 xl:grid-cols-2">
          <>
            <Card>
            <CardHeader>
              <CardTitle>ë°°ë„ˆ ?¤ì •</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-5 md:grid-cols-2">
              <div className="grid gap-2 md:col-span-2">
                <Label htmlFor="course-banner">ê°•ì˜ ë°°ë„ˆ ?´ë?ì§€</Label>
                <div className="grid gap-4 rounded-lg border bg-muted/20 p-4 lg:grid-cols-[minmax(0,32rem)_1fr] lg:items-center">
                  <div className="relative aspect-video overflow-hidden rounded-md border bg-muted">
                    {bannerPreviewUrl ? (
                      <Image
                        src={bannerPreviewUrl}
                        alt={`${draft.name || "ê°•ì˜"} ë°°ë„ˆ ë¯¸ë¦¬ë³´ê¸°`}
                        fill
                        unoptimized
                        sizes="(min-width: 1024px) 32rem, 100vw"
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex size-full flex-col items-center justify-center gap-2 text-muted-foreground">
                        <ImagePlus className="size-8" />
                        <span className="text-sm">?±ë¡??ë°°ë„ˆê°€ ?†ìŠµ?ˆë‹¤</span>
                      </div>
                    )}
                  </div>
                  <div>
                    <Input
                      ref={bannerInputRef}
                      id="course-banner"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="sr-only"
                      onChange={(event) => selectBanner(event.currentTarget.files?.[0])}
                    />
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => bannerInputRef.current?.click()}
                      >
                        <ImagePlus />
                        {bannerPreviewUrl ? "ë°°ë„ˆ êµì²´" : "ë°°ë„ˆ ? íƒ"}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        disabled={!bannerPreviewUrl}
                        onClick={removeBanner}
                      >
                        <Trash2 /> ë°°ë„ˆ ?? œ
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>ê°•ì˜ ê¸°ë³¸ ?•ë³´</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-5 md:grid-cols-2">
              <div className="grid gap-2 md:col-span-2">
                <Label htmlFor="course-name">ê°•ì˜ëª?/Label>
                <Input
                  id="course-name"
                  className="h-10"
                  placeholder="?? AI ?˜ìµ???¼ë„ ?¤ì „ ?´ë˜??
                  maxLength={200}
                  value={draft.name}
                  onChange={(event) => updateField("name", event.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="instructor-name">ê°•ì‚¬ëª?/Label>
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
                <Label htmlFor="course-cohort">ê¸°ìˆ˜</Label>
                <Input
                  id="course-cohort"
                  className="h-10"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={draft.cohort}
                  onChange={(event) => updateField("cohort", event.target.value.replace(/\D/gu, ""))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="free-webinar-date">ë¬´ë£Œ ?¨ë¹„??? ì§œ</Label>
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
                <Label htmlFor="free-webinar-time">ë¬´ë£Œ ?¨ë¹„???œê°„</Label>
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
                    <SelectValue placeholder="?œê°„ ? íƒ" />
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
                <Label htmlFor="starts-at">ê°œê°•??/Label>
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
              <div className="hidden">
                <Label htmlFor="course-materials-link">ê°•ì˜?ë£Œ ë§í¬</Label>
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
                        ë°”ë¡œ ?´ê¸°
                      </a>
                    ) : (
                      <span>
                        <ExternalLink />
                        ë°”ë¡œ ?´ê¸°
                      </span>
                    )}
                  </Button>
                </div>
              </div>
              </CardContent>
            </Card>

            <Card className="hidden">
              <CardHeader>
                <CardTitle className="hidden">?„ìˆ˜ ?‘ì—… ëª©ë¡</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>?œëª©</TableHead>
                      <TableHead className="w-[130px]">?„ë£Œ ?¬ë?</TableHead>
                      <TableHead className="w-[190px]">?°ë“œ?¼ì¸</TableHead>
                      <TableHead className="w-[170px]">?¨ì? ê¸°ê°„</TableHead>
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
                              {task.completed ? "?‘ì—… ?„ë£Œ" : "ì§„í–‰ ì¤?}
                            </Label>
                          </div>
                        </TableCell>
                        <TableCell>
                          <p className="font-medium tabular-nums">
                            {formatDeadlineDate(task.dueDate)}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            ë¬´ë£Œ ?¨ë¹„??{TASK_DEADLINE_WEEKS[task.key]}ì£???
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
          </>
        </div>

        <div>
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>ë§í¬ ê´€ë¦?/CardTitle>
            </div>
            <Button
              type="button"
              variant="outline"
              className="h-10 shrink-0"
              disabled={draft.customLinks.length >= 30}
              onClick={addCustomLink}
            >
              <Plus />
              ì»¤ìŠ¤?€ ë§í¬ ì¶”ê?
            </Button>
          </CardHeader>
          <CardContent className="grid gap-6 lg:grid-cols-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>?´ë¦„</TableHead>
                  <TableHead>ë§í¬</TableHead>
                  <TableHead className="text-center">ê´€ë¦?/TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {COURSE_LINKS.filter((_, index) => index % 2 === 0).map((item) => (
                  <CourseLinkInput
                    key={item.field}
                    field={item.field}
                    label={item.label}
                    value={draft[item.field]}
                    onChange={updateField}
                  />
                ))}
                {draft.customLinks.filter((_, index) => (COURSE_LINKS.length + index) % 2 === 0).map((link, index) => (
                  <CourseCustomLinkInput
                    key={index}
                    index={draft.customLinks.findIndex((candidate) => candidate === link)}
                    name={link.name}
                    url={link.url}
                    onChange={updateCustomLink}
                    onDelete={deleteCustomLink}
                  />
                ))}
              </TableBody>
            </Table>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>?´ë¦„</TableHead>
                  <TableHead>ë§í¬</TableHead>
                  <TableHead className="text-center">ê´€ë¦?/TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {COURSE_LINKS.filter((_, index) => index % 2 === 1).map((item) => (
                  <CourseLinkInput
                    key={item.field}
                    field={item.field}
                    label={item.label}
                    value={draft[item.field]}
                    onChange={updateField}
                  />
                ))}
                {draft.customLinks.filter((_, index) => (COURSE_LINKS.length + index) % 2 === 1).map((link, index) => (
                  <CourseCustomLinkInput
                    key={index}
                    index={draft.customLinks.findIndex((candidate) => candidate === link)}
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
            <CardTitle>?ë§¤ ?´ë²¤??/CardTitle>
            <CardDescription>
              ê¸°ê°„, ?œíƒ, ?œê³µ ì¡°ê±´???ìœ ë¡?²Œ ê¸°ë¡?©ë‹ˆ??
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="early-bird-event">?¼ë¦¬ë²„ë“œ ?´ë²¤??/Label>
              <Textarea
                id="early-bird-event"
                className="h-32 min-h-32 max-h-32 resize-none overflow-y-auto field-sizing-fixed"
                placeholder="?? 9??1?¼ê¹Œì§€ 10ë§Œì› ? ì¸"
                maxLength={2_000}
                value={draft.earlyBirdEvent}
                onChange={(event) =>
                  updateField("earlyBirdEvent", event.target.value)
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="first-50-event">? ì°©??50ëª??´ë²¤??/Label>
              <Textarea
                id="first-50-event"
                className="h-32 min-h-32 max-h-32 resize-none overflow-y-auto field-sizing-fixed"
                placeholder="?? ?Œí¬ë¶ê³¼ 1:1 ?¼ë“œë°??œê³µ"
                maxLength={2_000}
                value={draft.first50Event}
                onChange={(event) =>
                  updateField("first50Event", event.target.value)
                }
              />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="course-differentiation">
                ê°•ì˜ ì°¨ë³„?ì„ ?ì„¸?˜ê²Œ ê¸°ì¬
              </Label>
              <Textarea
                id="course-differentiation"
                className="h-48 min-h-48 resize-y field-sizing-fixed"
                placeholder="?¤ë¥¸ ê°•ì˜?€ êµ¬ë¶„?˜ëŠ” ?¹ì§•, ?œê³µ ê°€ì¹˜ì? ?˜ê°•?ì´ ?»ê²Œ ??ë³€?”ë? ?ì„¸?˜ê²Œ ê¸°ì¬??ì£¼ì„¸??"
                maxLength={10_000}
                value={draft.courseDifferentiation}
                onChange={(event) =>
                  updateField("courseDifferentiation", event.target.value)
                }
              />
              <p className="text-right text-xs text-muted-foreground">
                {draft.courseDifferentiation.length.toLocaleString()} / 10,000??
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>ê°•ì˜ ?µì…˜ê³?ê°€ê²?/CardTitle>
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
                ?µì…˜ ì¶”ê?
              </Button>
            </div>
            <CardDescription>
              ?•ìƒê°€?€ ?ë§¤ê°€ë¥??…ë ¥?˜ë©´ ? ì¸ê¸ˆì•¡ê³?12ê°œì›” ë¬´ì´?????©ë??¡ì„
              ?ë™?¼ë¡œ ê³„ì‚°?©ë‹ˆ??
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="pb-1">
              <div className="space-y-2">
                {draft.options.length > 0 ? (
                  <div className="hidden grid-cols-[minmax(120px,0.8fr)_110px_110px_64px_130px_140px_minmax(180px,1fr)_90px_44px] items-center gap-2 px-1 text-xs font-medium text-muted-foreground xl:grid">
                    <span>?µì…˜ëª?/span>
                    <span>?•ìƒê°€</span>
                    <span>?ë§¤ê°€</span>
                    <span>? ì¸??/span>
                    <span>?¼ë¦¬ë²„ë“œ ? ì¸ê¸ˆì•¡</span>
                    <span>12ê°œì›” ë¬´ì´??/span>
                    <span>?¨í†¡ë°?ì£¼ì†Œ</span>
                    <span>?…ì¥ì½”ë“œ</span>
                    <span className="sr-only">?? œ</span>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                    ?±ë¡???µì…˜???†ìŠµ?ˆë‹¤. ?µì…˜ ?†ì´??ê°•ì˜ë¥?ë§Œë“¤ ???ˆìŠµ?ˆë‹¤.
                  </div>
                )}
                {draft.options.map((option, index) => (
                  <div
                    key={`option-${index}`}
                    className="grid grid-cols-1 items-center gap-2 xl:grid-cols-[minmax(120px,0.8fr)_110px_110px_64px_130px_140px_minmax(180px,1fr)_90px_44px]"
                  >
                    <Input
                      id={`option-name-${index}`}
                      className="h-10 text-sm"
                      aria-label={`${index + 1}ë²??µì…˜ëª?}
                      placeholder="?? ê¸°ë³¸ ê³¼ì •"
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
                      aria-label={`${index + 1}ë²??µì…˜ ?•ìƒê°€`}
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
                      aria-label={`${index + 1}ë²??µì…˜ ?ë§¤ê°€`}
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
                    <div
                      className="flex h-10 items-center justify-between rounded-md border bg-muted/30 px-3 font-mono text-xs xl:justify-end"
                      aria-label={`${index + 1}ë²??µì…˜ ?¼ë¦¬ë²„ë“œ ? ì¸ê¸ˆì•¡`}
                    >
                      <span className="text-muted-foreground xl:hidden">
                        ?¼ë¦¬ë²„ë“œ ? ì¸
                      </span>
                      <span>
                        {formatCalculatedPrice(
                          calculateEarlyBirdDiscountAmount(
                            option.listPrice,
                            option.salePrice,
                          ),
                        )}
                      </span>
                    </div>
                    <div
                      className="flex h-10 items-center justify-between rounded-md border bg-muted/30 px-3 font-mono text-xs xl:justify-end"
                      aria-label={`${index + 1}ë²??µì…˜ 12ê°œì›” ë¬´ì´?????©ë???}
                    >
                      <span className="text-muted-foreground xl:hidden">
                        12ê°œì›” ë¬´ì´??
                      </span>
                      <span>
                        {formatCalculatedPrice(
                          calculateTwelveMonthInstallment(
                            option.listPrice,
                            option.salePrice,
                          ),
                          "????,
                        )}
                      </span>
                    </div>
                    <Input
                      id={`group-chat-link-${index}`}
                      className="h-10"
                      aria-label={`${index + 1}ë²??µì…˜ ?¨í†¡ë°?ì£¼ì†Œ`}
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
                      aria-label={`${index + 1}ë²??µì…˜ ?…ì¥ì½”ë“œ`}
                      placeholder="4~6ê¸€??
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
                      aria-label={`${index + 1}ë²??µì…˜ ?? œ`}
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

        <TabsContent value="information" className="mt-0">
          {sectionStatuses.videos !== "loaded" ? (
            <DeferredSectionState
              status={sectionStatuses.videos}
              error={sectionErrors.videos}
              onRetry={() => retrySection("videos")}
            />
          ) : (
          <div className="space-y-6">
        <Card className="overflow-x-auto">
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>? íŠœë¸?ì¶œì—°</CardTitle>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setDraft((current) => ({
                    ...current,
                    youtubeAppearances: [
                      ...current.youtubeAppearances,
                      {
                        channelName: "",
                        channelUrl: "",
                        videoUrl: "",
                        landingUtm: "",
                      },
                    ],
                  }))
                }
              >
                <Plus />
                ì¶œì—° ì¶”ê?
              </Button>
            </div>
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
                ?„ì§ ?±ë¡??? íŠœë¸?ì¶œì—° ?•ë³´ê°€ ?†ìŠµ?ˆë‹¤.
              </div>
            ) : (
              <div className="overflow-x-auto pb-1">
                <div className="min-w-[1200px] space-y-2">
                  <div className="grid grid-cols-[180px_minmax(240px,1fr)_minmax(240px,1fr)_minmax(280px,1fr)_72px_44px] items-center gap-2 px-1 text-xs font-medium text-muted-foreground">
                    <span>ì±„ë„ëª?/span>
                    <span>ì±„ë„ ì£¼ì†Œ</span>
                    <span>ê²Œì‹œ???ìƒ ì£¼ì†Œ</span>
                    <span>?œë”© UTM</span>
                    <span className="sr-only">ë§í¬ ?´ê¸°</span>
                    <span className="sr-only">?? œ</span>
                  </div>
                  {draft.youtubeAppearances.map((appearance, index) => (
                    <div
                      key={`youtube-${index}`}
                      className="grid grid-cols-[180px_minmax(240px,1fr)_minmax(240px,1fr)_minmax(280px,1fr)_72px_44px] items-center gap-2"
                    >
                      <Input
                        id={`channel-name-${index}`}
                        className="h-10"
                        aria-label={`${index + 1}ë²?? íŠœë¸?ì±„ë„ëª?}
                        placeholder="ì±„ë„ëª?
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
                        aria-label={`${index + 1}ë²?? íŠœë¸?ì±„ë„ ì£¼ì†Œ`}
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
                        aria-label={`${index + 1}ë²?ê²Œì‹œ ?ìƒ ì£¼ì†Œ`}
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
                      <Input
                        id={`landing-utm-${index}`}
                        className="h-10"
                        aria-label={`${index + 1}ë²??œë”© UTM`}
                        placeholder="utm_source=youtube&utm_medium=..."
                        maxLength={2000}
                        autoComplete="off"
                        value={appearance.landingUtm}
                        onChange={(event) =>
                          updateYoutubeAppearance(index, {
                            landingUtm: event.target.value,
                          })
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
                            ?´ê¸°
                          </a>
                        ) : (
                          <span>?´ê¸°</span>
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        aria-label={`${index + 1}ë²?? íŠœë¸?ì¶œì—° ?? œ`}
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

        <Card className="overflow-x-auto">
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>ê¸°ì¡´ ?¼ì´ë¸??ìƒ ë§í¬</CardTitle>
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
                ?ìƒ ì¶”ê?
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {draft.liveVideos.length === 0 ? (
              <div className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">
                ?„ì§ ?±ë¡???¼ì´ë¸??ìƒ ë§í¬ê°€ ?†ìŠµ?ˆë‹¤.
              </div>
            ) : (
              <div className="overflow-x-auto pb-1">
                <div className="min-w-[900px] space-y-2">
                  <div className="grid grid-cols-[220px_minmax(280px,1fr)_minmax(220px,1fr)_72px_44px] items-center gap-2 px-1 text-xs font-medium text-muted-foreground">
                    <span>?´ë¦„</span>
                    <span>ì£¼ì†Œ</span>
                    <span>ë¹„ê³ </span>
                    <span className="sr-only">ë§í¬ ?´ê¸°</span>
                    <span className="sr-only">?? œ</span>
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
                          aria-label={`${index + 1}ë²??¼ì´ë¸??ìƒ ?´ë¦„`}
                          placeholder="?ìƒ ?´ë¦„"
                          maxLength={200}
                          value={liveVideo.name}
                          onChange={(event) =>
                            updateLiveVideo(index, { name: event.target.value })
                          }
                        />
                        <Input
                          id={`live-video-url-${index}`}
                          className="h-10"
                          aria-label={`${index + 1}ë²??¼ì´ë¸??ìƒ ì£¼ì†Œ`}
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
                          aria-label={`${index + 1}ë²??¼ì´ë¸??ìƒ ë¹„ê³ `}
                          placeholder="ë¹„ê³ "
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
                              ?´ê¸°
                            </a>
                          ) : (
                            <span>?´ê¸°</span>
                          )}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          aria-label={`${index + 1}ë²??¼ì´ë¸??ìƒ ?? œ`}
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
            courseId={courseId}
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
                    <CardTitle>?¨ë¹„??ë¬¸ì ëª©ë¡ ?œë¹„???°ê²°</CardTitle>
                    <CardDescription className="mt-1">
                      ??ê°•ì˜?ì„œ ?¬ìš©??ë¬¸ì 30ê°??„ë¡œ?íŠ¸ë¥?? íƒ?˜ê±°???°ê²°??
                      ?´ì œ?©ë‹ˆ??
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {loadedMessageProjects.length === 0 ? (
                  <div className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">
                    ?°ê²° ê°€?¥í•œ ë¬¸ì ?œì‘ ?„ë¡œ?íŠ¸ê°€ ?†ìŠµ?ˆë‹¤.
                    <Button variant="link" asChild className="ml-1">
                      <Link href="/services/message-studio">
                        ë¬¸ì ?„ë¡œ?íŠ¸ ë§Œë“¤ê¸?
                      </Link>
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
                    <div className="grid min-w-0 flex-1 gap-2">
                      <Label htmlFor="message-project-select">ë¬¸ì ëª©ë¡</Label>
                      <Select
                        value={draft.messageProjectIds[0] ?? ""}
                        onValueChange={(messageProjectId) =>
                          void selectMessageProject(messageProjectId)
                        }
                      >
                        <SelectTrigger id="message-project-select" className="w-full">
                          <SelectValue placeholder="?°ê²°??ë¬¸ì ëª©ë¡??? íƒ?˜ì„¸?? />
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
                                {project.course_name} Â·{" "}
                                {project.instructor_name || "ê°•ì‚¬ ë¯¸ì…??} Â·{" "}
                                {generatedCount}/30 ?ì„±
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
                        ? íƒ ?´ì œ
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
                            ëª©ë¡ ?´ê¸° ({selectedMessageGeneratedCount}/30)
                          </Link>
                        ) : (
                          <span>
                            <ExternalLink />
                            ëª©ë¡ ?´ê¸°
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
                    <CardTitle>?°ê²°??ë¬¸ì ?´ìš©</CardTitle>
                    <CardDescription className="mt-1">
                      ? íƒ???¨ë¹„??ë¬¸ì ëª©ë¡???ì„±??ë¬¸êµ¬ë¥?ë²ˆí˜¸ ?œì„œ?€ë¡?ë³´ì—¬ì¤ë‹ˆ??
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {selectedMessageProject ? (
                      <Badge variant="secondary">
                        {selectedMessageResources.length}/30ê°?
                      </Badge>
                    ) : null}
                    {selectedMessageProject &&
                    selectedMessageResources.length > 0 ? (
                      <Button variant="outline" size="sm" asChild>
                        <a
                          href={`/api/message-studio/projects/${selectedMessageProject.id}/export`}
                        >
                          <Download />
                          ?„ì²´ ?‘ì? ?¤ìš´ë¡œë“œ
                        </a>
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" disabled>
                        <Download />
                        ?„ì²´ ?‘ì? ?¤ìš´ë¡œë“œ
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {messageContentLoadingId === selectedMessageProject?.id ? (
                  <div className="flex min-h-36 items-center justify-center gap-2 rounded-xl border border-dashed text-sm text-muted-foreground">
                    <Loader2 className="animate-spin" />
                    ë¬¸ì ?´ìš©??ë¶ˆëŸ¬?¤ëŠ” ì¤‘ì…?ˆë‹¤.
                  </div>
                ) : !selectedMessageProject ? (
                  <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                    ë¨¼ì? ?ë‹¨?ì„œ ë¬¸ì ëª©ë¡???°ê²°??ì£¼ì„¸??
                  </div>
                ) : selectedMessageResources.length === 0 ? (
                  <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                    ?°ê²°??ëª©ë¡???ì„±??ë¬¸ìê°€ ?†ìŠµ?ˆë‹¤.
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
                            {resource.position}ë²?
                          </Badge>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            aria-label={`${resource.position}ë²?ë¬¸ì ë³µì‚¬`}
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
                              ? "ë³µì‚¬??
                              : "ë³µì‚¬"}
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

        <TabsContent value="webinar" forceMount className="mt-0 data-[state=inactive]:hidden">
          {courseId ? <CourseWebinarEditor key={courseId} courseId={courseId} /> : null}
        </TabsContent>

        <TabsContent value="paid-students" className="mt-0">{paidRoster}</TabsContent>

        <TabsContent value="orders" className="mt-0">
          {courseId ? <CourseOrdersManager courseId={courseId} courseName={draft.name} onRosterSaved={() => changeTab("paid-students")} onCourseNameChange={(name) => setDraft((current) => ({ ...current, name }))} /> : null}
        </TabsContent>

        <TabsContent value="costs" className="mt-0">
          {courseId ? <CourseCostManager courseId={courseId} /> : null}
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
              ê°•ì˜ë¥?ë¨¼ì? ë§Œë“  ???•ì‚° ?ë£Œë¥??±ë¡?????ˆìŠµ?ˆë‹¤.
            </div>
          )}
        </TabsContent>
      </Tabs>

      {activeTab !== "costs" && activeTab !== "settlement" && activeTab !== "orders" && activeTab !== "webinar" ? (
        <div className="flex justify-end border-t pt-6">
          <Button className="min-h-10" onClick={saveCourse} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : <Save />}
            {saving ? "?€??ì¤? : courseId ? "ê°•ì˜ ?•ë³´ ?€?? : "ê°•ì˜ ë§Œë“¤ê¸?}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
