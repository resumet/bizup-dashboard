"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Copy,
  Download,
  ExternalLink,
  Loader2,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
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
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  allResourcePositions,
  type MessageStudioCourseOption,
  type MessageStudioDraft,
  type MessageStudioProject,
  type MessageStudioResource,
} from "@/lib/message-studio/types";

type ResourceDraft = {
  position: number;
  exampleText: string;
  generatedText: string;
  generationCount: number;
  generatedModel: string | null;
};

type GeneratedResult = {
  position: number;
  message: string;
};

type GenerationProgress = {
  completed: number;
  total: number;
  status: "running" | "completed" | "failed";
};

const GENERATION_BATCH_SIZE = 3;

export function MessageStudioProjectEditor({
  initialProject,
  initialResources,
  courses,
}: {
  initialProject: MessageStudioProject;
  initialResources: MessageStudioResource[];
  courses: MessageStudioCourseOption[];
}) {
  const router = useRouter();
  const [project, setProject] = useState<MessageStudioDraft>({
    course_name: initialProject.course_name,
    instructor_name: initialProject.instructor_name,
    course_features: initialProject.course_features,
    target_audience: initialProject.target_audience,
    payment_link: initialProject.payment_link,
    inquiry_link: initialProject.inquiry_link,
    curriculum_link: initialProject.curriculum_link,
    replay_link: initialProject.replay_link,
  });
  const [selectedCourseId, setSelectedCourseId] = useState(
    initialProject.course_id ?? "",
  );
  const resourceMap = new Map(
    initialResources.map((resource) => [resource.position, resource]),
  );
  const [resources, setResources] = useState<ResourceDraft[]>(() =>
    allResourcePositions().map((position) => {
      const resource = resourceMap.get(position);
      return {
        position,
        exampleText: resource?.example_text ?? "",
        generatedText: resource?.generated_text ?? "",
        generationCount: resource?.generation_count ?? 0,
        generatedModel: resource?.generated_model ?? null,
      };
    }),
  );
  const [busy, setBusy] = useState<
    "save" | "all" | "export" | "delete" | number | null
  >(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [generationProgress, setGenerationProgress] =
    useState<GenerationProgress | null>(null);
  const [resultOpen, setResultOpen] = useState(false);
  const [generatedResults, setGeneratedResults] = useState<GeneratedResult[]>(
    [],
  );

  function updateProject(field: keyof MessageStudioDraft, value: string) {
    setProject((current) => ({ ...current, [field]: value }));
  }

  function selectDashboardCourse(courseId: string) {
    const course = courses.find((item) => item.id === courseId);
    if (!course) return;
    setSelectedCourseId(course.id);
    setProject((current) => ({
      ...current,
      course_name: course.name,
      instructor_name: course.instructor_name,
      payment_link: course.payment_link,
      inquiry_link: course.inquiry_link,
      curriculum_link: course.curriculum_link,
      replay_link: course.free_gift_link,
    }));
    setNotice(
      "강의 대시보드 정보를 적용했습니다. 저장 버튼을 눌러 확정해 주세요.",
    );
    setError("");
  }

  function openLink(label: string, value: string) {
    try {
      const url = new URL(value.trim());
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error();
      }

      setError("");
      window.open(url.toString(), "_blank", "noopener,noreferrer");
    } catch {
      setError(`${label}가 올바른 HTTP 또는 HTTPS 주소가 아닙니다.`);
    }
  }

  function updateResource(
    position: number,
    field: "exampleText" | "generatedText",
    value: string,
  ) {
    setResources((current) =>
      current.map((resource) =>
        resource.position === position
          ? { ...resource, [field]: value }
          : resource,
      ),
    );
  }

  async function persist(showNotice = true) {
    setError("");
    if (showNotice) setNotice("");
    const response = await fetch(
      `/api/message-studio/projects/${initialProject.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project,
          courseId: selectedCourseId || null,
          resources,
        }),
      },
    );
    const body = await response.json();
    if (!response.ok) throw new Error(body.message ?? "저장하지 못했습니다.");
    if (Array.isArray(body.resources)) {
      const normalized = new Map<number, string>(
        body.resources.map(
          (resource: { position: number; generatedText: string }) => [
            resource.position,
            resource.generatedText,
          ],
        ),
      );
      setResources((current) =>
        current.map((resource) =>
          normalized.has(resource.position)
            ? {
                ...resource,
                generatedText: normalized.get(resource.position)!,
              }
            : resource,
        ),
      );
    }
    if (showNotice) setNotice("강의 정보와 문자 리소스를 저장했습니다.");
  }

  async function save() {
    setBusy("save");
    try {
      await persist();
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "저장하지 못했습니다.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function requestGeneration(positions: number[]) {
    const response = await fetch(
      `/api/message-studio/projects/${initialProject.id}/generate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ positions }),
      },
    );
    const body = await response.json();
    if (!response.ok)
      throw new Error(body.message ?? "AI 생성에 실패했습니다.");
    return {
      messages: body.messages as GeneratedResult[],
      model: String(body.model ?? ""),
    };
  }

  function applyGeneratedMessages(messages: GeneratedResult[], model: string) {
    const generated = new Map(
      messages.map((item) => [item.position, item.message]),
    );
    setResources((current) =>
      current.map((resource) =>
        generated.has(resource.position)
          ? {
              ...resource,
              generatedText: generated.get(resource.position)!,
              generationCount: resource.generationCount + 1,
              generatedModel: model,
            }
          : resource,
      ),
    );
  }

  async function generate(positions: number[]) {
    const isBulkGeneration = positions.length > 1;
    setBusy(isBulkGeneration ? "all" : positions[0]);
    setError("");
    setNotice("");
    if (isBulkGeneration) {
      setResultOpen(false);
      setGeneratedResults([]);
      setGenerationProgress({
        completed: 0,
        total: positions.length,
        status: "running",
      });
    } else {
      setGenerationProgress(null);
    }

    try {
      await persist(false);

      if (!isBulkGeneration) {
        const result = await requestGeneration(positions);
        applyGeneratedMessages(result.messages, result.model);
        setNotice(`${positions[0]}번 문자를 생성했습니다.`);
        return;
      }

      const allResults: GeneratedResult[] = [];
      for (
        let start = 0;
        start < positions.length;
        start += GENERATION_BATCH_SIZE
      ) {
        const batch = positions.slice(start, start + GENERATION_BATCH_SIZE);
        const result = await requestGeneration(batch);
        allResults.push(...result.messages);
        applyGeneratedMessages(result.messages, result.model);
        setGenerationProgress({
          completed: allResults.length,
          total: positions.length,
          status: "running",
        });
      }

      const sortedResults = allResults.toSorted(
        (a, b) => a.position - b.position,
      );
      setGeneratedResults(sortedResults);
      setGenerationProgress({
        completed: sortedResults.length,
        total: positions.length,
        status: "completed",
      });
      setNotice(`신규 문자 ${sortedResults.length}개를 모두 생성했습니다.`);
      setResultOpen(true);
    } catch (caught) {
      setGenerationProgress((current) =>
        current ? { ...current, status: "failed" } : null,
      );
      setError(
        caught instanceof Error ? caught.message : "AI 생성에 실패했습니다.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function exportXlsx() {
    setBusy("export");
    setError("");
    try {
      await persist(false);
      const response = await fetch(
        `/api/message-studio/projects/${initialProject.id}/export`,
      );
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.message ?? "내보내지 못했습니다.");
      }
      const blobUrl = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = blobUrl;
      anchor.download = `${project.course_name || "강의"}_문자30개.xlsx`;
      anchor.click();
      URL.revokeObjectURL(blobUrl);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "내보내지 못했습니다.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function deleteProject() {
    if (!window.confirm(`“${project.course_name}” 프로젝트를 삭제할까요?`))
      return;
    setBusy("delete");
    setError("");
    try {
      const response = await fetch(
        `/api/message-studio/projects/${initialProject.id}`,
        { method: "DELETE" },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.message ?? "삭제하지 못했습니다.");
      router.push("/services/message-studio");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "삭제하지 못했습니다.",
      );
      setBusy(null);
    }
  }

  const exampleCount = resources.filter((resource) =>
    resource.exampleText.trim(),
  ).length;
  const generatedCount = resources.filter((resource) =>
    resource.generatedText.trim(),
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <div className="mb-3 flex flex-wrap gap-2">
            <Badge variant="outline">예시 {exampleCount}/30</Badge>
            <Badge variant={generatedCount === 30 ? "default" : "secondary"}>
              신규 {generatedCount}/30
            </Badge>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">
            {project.course_name || "새 강의"}
          </h1>
          <p className="mt-2 text-muted-foreground">
            기존 문자와 같은 역할을 하는 신규 문자 30개를 제작합니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={save} disabled={busy !== null}>
            {busy === "save" ? <Loader2 className="animate-spin" /> : <Save />}
            저장
          </Button>
          <Button
            variant="outline"
            onClick={exportXlsx}
            disabled={busy !== null}
          >
            {busy === "export" ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Download />
            )}
            엑셀 출력
          </Button>
          <Button
            onClick={() => generate(allResourcePositions())}
            disabled={busy !== null || exampleCount !== 30}
          >
            {busy === "all" ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Sparkles />
            )}
            {busy === "all" && generationProgress
              ? `${generationProgress.completed}/${generationProgress.total} 생성 중`
              : "30개 전체 생성"}
          </Button>
        </div>
      </div>

      {generationProgress && (
        <Card className="overflow-hidden border-primary/30">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-semibold">
                  {generationProgress.status === "completed"
                    ? "전체 생성 완료"
                    : generationProgress.status === "failed"
                      ? "전체 생성 중단"
                      : "전체 문자를 생성하고 있습니다"}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {generationProgress.completed.toLocaleString("ko-KR")}개 /{" "}
                  {generationProgress.total.toLocaleString("ko-KR")}개
                </p>
              </div>
              <div className="flex items-center gap-3">
                {generationProgress.status === "completed" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setResultOpen(true)}
                  >
                    결과 보기
                  </Button>
                )}
                <strong className="text-2xl tabular-nums">
                  {Math.round(
                    (generationProgress.completed / generationProgress.total) *
                      100,
                  )}
                  %
                </strong>
              </div>
            </div>
            <div
              className="mt-4 h-2 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-label="전체 문자 생성 진행률"
              aria-valuemin={0}
              aria-valuemax={generationProgress.total}
              aria-valuenow={generationProgress.completed}
            >
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-300"
                style={{
                  width: `${(generationProgress.completed / generationProgress.total) * 100}%`,
                }}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertTitle>처리할 수 없습니다.</AlertTitle>
          <AlertDescription className="whitespace-pre-line">
            {error}
          </AlertDescription>
        </Alert>
      )}
      {notice && (
        <Alert>
          <Sparkles />
          <AlertTitle>완료</AlertTitle>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">강의 정보</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5">
          <div className="grid gap-4 md:grid-cols-2">
            <DashboardCourseSelect
              label="강의명"
              value={selectedCourseId}
              courses={courses}
              display="course"
              onChange={selectDashboardCourse}
            />
            <DashboardCourseSelect
              label="강사명"
              value={selectedCourseId}
              courses={courses}
              display="instructor"
              onChange={selectDashboardCourse}
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <AreaField
              label="강의 특징"
              value={project.course_features}
              placeholder="차별점, 핵심 혜택, 진행 방식 등을 입력하세요."
              onChange={(value) => updateProject("course_features", value)}
            />
            <AreaField
              label="들어야 할 사람"
              value={project.target_audience}
              placeholder="고민, 현재 상태, 목표를 구체적으로 입력하세요."
              onChange={(value) => updateProject("target_audience", value)}
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <DashboardLinkSelect
              label="결제 링크"
              value={project.payment_link}
              courses={courses}
              field="payment_link"
              onChange={(value) => updateProject("payment_link", value)}
              onOpen={() => openLink("결제 링크", project.payment_link)}
            />
            <DashboardLinkSelect
              label="문의 링크"
              value={project.inquiry_link}
              courses={courses}
              field="inquiry_link"
              onChange={(value) => updateProject("inquiry_link", value)}
              onOpen={() => openLink("문의 링크", project.inquiry_link)}
            />
            <DashboardLinkSelect
              label="커리큘럼 링크"
              value={project.curriculum_link}
              courses={courses}
              field="curriculum_link"
              onChange={(value) => updateProject("curriculum_link", value)}
              onOpen={() => openLink("커리큘럼 링크", project.curriculum_link)}
            />
            <DashboardLinkSelect
              label="다시보기 링크 (사후 세일즈)"
              value={project.replay_link}
              courses={courses}
              field="free_gift_link"
              onChange={(value) => updateProject("replay_link", value)}
              onOpen={() => openLink("다시보기 링크", project.replay_link)}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-end justify-between gap-4 pt-4">
        <div>
          <h2 className="text-2xl font-semibold">문자 리소스 30개</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            왼쪽에 예시를 입력하면 오른쪽에 새 문자가 생성됩니다.
          </p>
        </div>
        <Badge variant="outline">자동 저장 아님 · 저장 버튼 사용</Badge>
      </div>

      <div className="space-y-5">
        {resources.map((resource) => (
          <Card key={resource.position} id={`message-${resource.position}`}>
            <CardHeader className="flex-row items-center justify-between gap-3 border-b">
              <div className="flex items-center gap-3">
                <span className="grid size-8 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                  {resource.position}
                </span>
                <CardTitle className="text-base">
                  문자 섹션 {resource.position}
                </CardTitle>
              </div>
              <div className="flex items-center gap-2">
                {resource.generationCount > 0 && (
                  <Badge variant="secondary">
                    {resource.generationCount}회 생성
                  </Badge>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => generate([resource.position])}
                  disabled={busy !== null || !resource.exampleText.trim()}
                >
                  {busy === resource.position ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <RefreshCw />
                  )}
                  {resource.generatedText ? "다시 생성" : "생성"}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 pt-5 lg:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor={`example-${resource.position}`}>
                  기존 리소스
                </Label>
                <Textarea
                  id={`example-${resource.position}`}
                  className="min-h-52 resize-y leading-6"
                  placeholder={`${resource.position}번 예시 문자를 입력하세요.`}
                  value={resource.exampleText}
                  onChange={(event) =>
                    updateResource(
                      resource.position,
                      "exampleText",
                      event.target.value,
                    )
                  }
                />
              </div>
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor={`generated-${resource.position}`}>
                    신규 AI 리소스
                  </Label>
                  <Button
                    variant="ghost"
                    size="xs"
                    disabled={!resource.generatedText}
                    onClick={() =>
                      navigator.clipboard.writeText(resource.generatedText)
                    }
                  >
                    <Copy />
                    복사
                  </Button>
                </div>
                <Textarea
                  id={`generated-${resource.position}`}
                  className="min-h-52 resize-y bg-primary/[0.03] leading-6"
                  placeholder="AI로 생성된 신규 문자가 여기에 표시됩니다."
                  value={resource.generatedText}
                  onChange={(event) =>
                    updateResource(
                      resource.position,
                      "generatedText",
                      event.target.value,
                    )
                  }
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex justify-end border-t pt-6">
        <Button
          variant="destructive"
          onClick={deleteProject}
          disabled={busy !== null}
        >
          {busy === "delete" ? (
            <Loader2 className="animate-spin" />
          ) : (
            <Trash2 />
          )}
          프로젝트 삭제
        </Button>
      </div>

      <Dialog open={resultOpen} onOpenChange={setResultOpen}>
        <DialogContent className="max-h-[92vh] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle className="text-xl">전체 생성 결과</DialogTitle>
            <DialogDescription>
              {project.course_name || "강의"} 문자 {generatedResults.length}개가
              생성되었습니다. 내용을 확인하거나 복사하고 엑셀로 출력할 수
              있습니다.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 overflow-y-auto pr-1 sm:grid-cols-2">
            {generatedResults.map((result) => (
              <section
                key={result.position}
                className="rounded-xl border bg-background p-4"
              >
                <div className="mb-3 flex items-center justify-between gap-3">
                  <Badge>{result.position}번</Badge>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() =>
                      navigator.clipboard.writeText(result.message)
                    }
                  >
                    <Copy />
                    복사
                  </Button>
                </div>
                <p className="whitespace-pre-wrap break-words leading-6">
                  {result.message}
                </p>
              </section>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResultOpen(false)}>
              닫기
            </Button>
            <Button onClick={exportXlsx} disabled={busy !== null}>
              {busy === "export" ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Download />
              )}
              엑셀 출력
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DashboardCourseSelect({
  label,
  value,
  courses,
  display,
  onChange,
}: {
  label: string;
  value: string;
  courses: MessageStudioCourseOption[];
  display: "course" | "instructor";
  onChange: (value: string) => void;
}) {
  const id = `field-${label}`;
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>
        {label}
        <span className="ml-1 text-destructive">*</span>
      </Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue
            placeholder={
              courses.length > 0
                ? `${label}을 선택하세요`
                : "강의 대시보드에 등록된 강의가 없습니다"
            }
          />
        </SelectTrigger>
        <SelectContent>
          {courses.map((course) => (
            <SelectItem key={course.id} value={course.id}>
              {display === "course"
                ? course.name
                : course.instructor_name || "강사 미입력"}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

type DashboardLinkField =
  "payment_link" | "inquiry_link" | "curriculum_link" | "free_gift_link";

function DashboardLinkSelect({
  label,
  value,
  courses,
  field,
  onChange,
  onOpen,
}: {
  label: string;
  value: string;
  courses: MessageStudioCourseOption[];
  field: DashboardLinkField;
  onChange: (value: string) => void;
  onOpen: () => void;
}) {
  const id = `field-${field}`;
  const seen = new Set<string>();
  const options = courses.flatMap((course) => {
    const url = course[field]?.trim();
    if (!url || seen.has(url)) return [];
    seen.add(url);
    return [{ courseId: course.id, courseName: course.name, url }];
  });
  const hasSavedOnlyValue = Boolean(value && !seen.has(value));

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger id={id} className="min-w-0 flex-1">
            <SelectValue placeholder="강의 대시보드에서 링크를 선택하세요" />
          </SelectTrigger>
          <SelectContent>
            {hasSavedOnlyValue ? (
              <SelectItem value={value}>현재 저장된 링크 · {value}</SelectItem>
            ) : null}
            {options.map((option) => (
              <SelectItem
                key={`${option.courseId}-${option.url}`}
                value={option.url}
              >
                {option.courseName} · {option.url}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          className="shrink-0"
          disabled={!value.trim()}
          onClick={onOpen}
        >
          <ExternalLink />
          링크 열기
        </Button>
      </div>
    </div>
  );
}

function AreaField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  const id = `field-${label}`;
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        className="min-h-28 resize-y"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
