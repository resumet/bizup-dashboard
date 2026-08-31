"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  LibraryBig,
  Loader2,
  Plus,
  Sparkles,
} from "lucide-react";

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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { MessageStudioCourseOption } from "@/lib/message-studio/types";

type ProjectSummary = {
  id: string;
  course_name: string;
  instructor_name: string;
  updated_at: string;
  message_studio_resources: Array<{ generated_text: string }>;
};

export function MessageStudioProjectManager({
  projects,
  courses,
  loadError,
}: {
  projects: ProjectSummary[];
  courses: MessageStudioCourseOption[];
  loadError?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [courseId, setCourseId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function createProject() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/message-studio/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message ?? "프로젝트 생성 실패");
      setOpen(false);
      router.push(`/services/message-studio/${body.id}`);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "생성하지 못했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <Badge variant="outline" className="mb-3">
            AI 카피라이팅
          </Badge>
          <h1 className="text-3xl font-semibold tracking-tight">
            문자 생성·제작 프로그램
          </h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            강의마다 예시 문자 30개를 저장하고, 같은 목적의 신규 문자를 AI로
            제작합니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href="/services/message-studio/templates">
              <LibraryBig />
              기본 템플릿 관리
            </Link>
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus />새 강의 만들기
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>새 문자 제작 프로젝트</DialogTitle>
                <DialogDescription>
                  강의 단위로 문자 30개와 생성 결과를 관리합니다.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-2">
                <Label htmlFor="new-course-id">강의 선택</Label>
                <Select value={courseId} onValueChange={setCourseId}>
                  <SelectTrigger id="new-course-id" className="w-full">
                    <SelectValue placeholder="강의 대시보드에서 선택하세요" />
                  </SelectTrigger>
                  <SelectContent>
                    {courses.map((course) => (
                      <SelectItem key={course.id} value={course.id}>
                        {course.name} ·{" "}
                        {course.instructor_name || "강사 미입력"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {courses.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    먼저 강의 운영 자동화에서 강의를 만들어 주세요.
                  </p>
                ) : null}
              </div>
              {error && (
                <Alert variant="destructive">
                  <AlertTitle>생성할 수 없습니다.</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <DialogFooter>
                <Button onClick={createProject} disabled={busy || !courseId}>
                  {busy ? <Loader2 className="animate-spin" /> : <Plus />}
                  만들기
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {loadError && (
        <Alert variant="destructive">
          <AlertTitle>프로젝트를 불러오지 못했습니다.</AlertTitle>
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      {projects.length === 0 ? (
        <Card>
          <CardContent className="flex min-h-72 flex-col items-center justify-center text-center">
            <span className="mb-4 grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
              <Sparkles className="size-5" />
            </span>
            <h2 className="font-semibold">아직 만든 강의가 없습니다.</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              첫 강의를 만들고 예시 문자 30개를 입력해 보세요.
            </p>
            <Button className="mt-5" onClick={() => setOpen(true)}>
              <Plus />새 강의 만들기
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => {
            const generatedCount = project.message_studio_resources.filter(
              (resource) => resource.generated_text.trim(),
            ).length;
            return (
              <Card
                key={project.id}
                className="transition-shadow hover:shadow-md"
              >
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                      <Sparkles className="size-4" />
                    </span>
                    <Badge
                      variant={generatedCount === 30 ? "default" : "secondary"}
                    >
                      {generatedCount}/30 생성
                    </Badge>
                  </div>
                  <CardTitle className="pt-2">{project.course_name}</CardTitle>
                  <CardDescription>
                    {project.instructor_name || "강사명 미입력"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex items-center justify-between border-t pt-5">
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <CalendarDays className="size-3.5" />
                    {new Date(project.updated_at).toLocaleDateString("ko-KR")}
                  </span>
                  <Button asChild size="sm">
                    <Link href={`/services/message-studio/${project.id}`}>
                      작업하기
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
