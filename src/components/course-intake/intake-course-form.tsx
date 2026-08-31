"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BookPlus, CheckCircle2, Loader2, LogOut } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { COURSE_INTAKE_WEBINAR_TIME_OPTIONS } from "@/lib/course-intake/validation";

const EMPTY_FORM = {
  courseName: "",
  instructorName: "",
  freeWebinarDate: "",
  freeWebinarTime: "",
  startsDate: "",
};

export function IntakeCourseForm() {
  const router = useRouter();
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState("");
  const [createdCourseId, setCreatedCourseId] = useState("");

  function updateField(field: keyof typeof EMPTY_FORM, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setCreatedCourseId("");
    try {
      const response = await fetch("/api/course-intake/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = (await response.json()) as { id?: string; message?: string };
      if (!response.ok || !body.id) {
        if (response.status === 401) router.refresh();
        throw new Error(body.message ?? "강의를 생성하지 못했습니다.");
      }
      setCreatedCourseId(body.id);
      setForm(EMPTY_FORM);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "강의를 생성하지 못했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  async function logout() {
    setLoggingOut(true);
    try {
      await fetch("/api/course-intake/logout", { method: "POST" });
      router.refresh();
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <div className="w-full max-w-2xl space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">강의 자동 생성</h1>
          <p className="mt-2 text-muted-foreground">기본 정보를 입력하면 강의 운영 목록에 즉시 등록됩니다.</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={logout} disabled={loggingOut}>
          {loggingOut ? <Loader2 className="animate-spin" /> : <LogOut />}
          로그아웃
        </Button>
      </div>

      {createdCourseId ? (
        <Alert className="border-emerald-200 bg-emerald-50 text-emerald-950" aria-live="polite">
          <CheckCircle2 />
          <AlertTitle>강의가 생성되었습니다</AlertTitle>
          <AlertDescription>강의 ID: {createdCourseId}</AlertDescription>
        </Alert>
      ) : null}
      {error ? (
        <Alert variant="destructive" aria-live="polite">
          <AlertTitle>강의를 생성하지 못했습니다</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <span className="mb-2 grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
            <BookPlus className="size-5" />
          </span>
          <CardTitle>새 강의 정보</CardTitle>
          <CardDescription>생성 후 내부 강의 상세 화면에서 옵션과 이벤트를 추가할 수 있습니다.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-5 sm:grid-cols-2" onSubmit={submit}>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="intake-course-name">강의명</Label>
              <Input id="intake-course-name" required maxLength={200} value={form.courseName} onChange={(event) => updateField("courseName", event.target.value)} />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="intake-instructor-name">강사명</Label>
              <Input id="intake-instructor-name" required maxLength={120} value={form.instructorName} onChange={(event) => updateField("instructorName", event.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="intake-webinar-date">무료 웨비나 날짜</Label>
              <Input id="intake-webinar-date" type="date" required value={form.freeWebinarDate} onChange={(event) => updateField("freeWebinarDate", event.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="intake-webinar-time">무료 웨비나 시간</Label>
              <Select value={form.freeWebinarTime} onValueChange={(value) => updateField("freeWebinarTime", value)} required>
                <SelectTrigger id="intake-webinar-time">
                  <SelectValue placeholder="시간 선택" />
                </SelectTrigger>
                <SelectContent>
                  {COURSE_INTAKE_WEBINAR_TIME_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="intake-starts-date">개강일</Label>
              <Input id="intake-starts-date" type="date" required value={form.startsDate} onChange={(event) => updateField("startsDate", event.target.value)} />
            </div>
            <Button className="min-h-11 sm:col-span-2" disabled={submitting}>
              {submitting ? <Loader2 className="animate-spin" /> : <BookPlus />}
              {submitting ? "생성 중" : "강의 생성하기"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
