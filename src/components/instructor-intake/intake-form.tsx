"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  MAX_PHOTOS,
  MAX_PHOTO_BYTES,
  saveSchema,
  type Answers,
  type Photo,
} from "@/lib/instructor-intake/model";
import { IntakeProgress } from "./progress";

function readAnswers(form: HTMLFormElement): Answers {
  const data = new FormData(form);
  const text = (key: string) => String(data.get(key) ?? "").trim();
  const number = (key: string) => (text(key) === "" ? null : Number(text(key)));
  const urls = (key: string) =>
    text(key)
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter(Boolean);
  const experience = text("hasTeachingExperience");
  return {
    realName: text("realName"),
    nickname: text("nickname"),
    lectureItem: text("lectureItem"),
    hasTeachingExperience: experience === "" ? null : experience === "yes",
    teachingCount: experience === "yes" ? number("teachingCount") : null,
    studentCount: experience === "yes" ? number("studentCount") : null,
    materialsUrls: data.has("materialsUnavailable")
      ? []
      : urls("materialsUrls"),
    materialsUnavailable: data.has("materialsUnavailable"),
    youtubeUrls: data.has("youtubeUnavailable") ? [] : urls("youtubeUrls"),
    youtubeUnavailable: data.has("youtubeUnavailable"),
    monthlyRevenue: number("monthlyRevenue"),
    monthlyProfit: number("monthlyProfit"),
    expectedRevenue: number("expectedRevenue"),
    expectedProfit: number("expectedProfit"),
    availableStudents: number("availableStudents"),
  };
}

function NumericField({
  name,
  label,
  value,
  min = 0,
  help,
}: {
  name: string;
  label: string;
  value: number | null;
  min?: number;
  help?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        type="number"
        inputMode={min < 0 ? "text" : "numeric"}
        min={min}
        max={name === "availableStudents" ? 100_000 : 1_000_000_000_000}
        step="1"
        defaultValue={value ?? ""}
        aria-describedby={help ? `${name}-help` : undefined}
      />
      {help ? (
        <p id={`${name}-help`} className="text-sm text-muted-foreground">
          {help}
        </p>
      ) : null}
    </div>
  );
}
const sectionClass = "space-y-5 rounded-xl border bg-card p-5 sm:p-6";

export function IntakeForm({
  token,
  initialAnswers,
  initialPhotos,
  initialRevision,
  submittedAt,
}: {
  token: string;
  initialAnswers: Answers;
  initialPhotos: Photo[];
  initialRevision: number;
  submittedAt: string | null;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [answers, setAnswers] = useState(initialAnswers);
  const [photos, setPhotos] = useState(initialPhotos);
  const [revision, setRevision] = useState(initialRevision);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(
    submittedAt ? "제출된 정보입니다. 수정 후 다시 제출할 수 있습니다." : "",
  );
  const [error, setError] = useState("");
  async function save(submit: boolean) {
    if (!formRef.current || busy) return;
    setError("");
    setMessage("");
    const parsed = saveSchema.safeParse({
      answers: readAnswers(formRef.current),
      photoPaths: photos.map((photo) => photo.path),
      revision,
      submit,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/public/instructor-intakes/${token}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      setRevision(result.revision);
      setAnswers(parsed.data.answers);
      setMessage(
        submit
          ? "강사 정보를 제출했습니다. 감사합니다."
          : "현재까지 작성한 정보를 저장했습니다. 같은 링크에서 이어서 작성할 수 있습니다.",
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "저장하지 못했습니다. 다시 시도해 주세요.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function upload(files: File[]) {
    if (!files.length || busy) return;
    setError("");
    setMessage("");
    if (files.length + photos.length > MAX_PHOTOS) {
      setError(`프로필 사진은 최대 ${MAX_PHOTOS}장까지 추가할 수 있습니다.`);
      return;
    }
    if (
      files.some(
        (file) =>
          file.size > MAX_PHOTO_BYTES ||
          !["image/jpeg", "image/png", "image/webp"].includes(file.type),
      )
    ) {
      setError("사진은 3MB 이하의 JPG, PNG, WebP 파일을 선택해 주세요.");
      return;
    }
    setBusy(true);
    let currentRevision = revision;
    try {
      for (const file of files) {
        const data = new FormData();
        data.set("photo", file);
        data.set("revision", String(currentRevision));
        const response = await fetch(
          `/api/public/instructor-intakes/${token}/photos`,
          { method: "POST", body: data },
        );
        const result = await response.json();
        if (!response.ok) throw new Error(result.message);
        currentRevision = result.revision;
        setRevision(currentRevision);
        setPhotos((previous) => [...previous, result.photo]);
      }
      setMessage(
        "프로필 사진을 저장했습니다. 작성한 내용도 중간 저장하거나 제출해 주세요.",
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "사진을 저장하지 못했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      ref={formRef}
      className="space-y-6"
      noValidate
      onChange={() => {
        if (formRef.current) setAnswers(readAnswers(formRef.current));
      }}
      onSubmit={(event) => {
        event.preventDefault();
        void save(true);
      }}
    >
      <IntakeProgress answers={answers} photoCount={photos.length} />
      <fieldset disabled={busy} className="space-y-6">
        <section className={sectionClass}>
          <h2 className="text-lg font-semibold">기본 정보</h2>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="realName">1. 본명</Label>
              <Input
                id="realName"
                name="realName"
                autoComplete="name"
                maxLength={80}
                defaultValue={initialAnswers.realName}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nickname">2. 닉네임</Label>
              <Input
                id="nickname"
                name="nickname"
                maxLength={80}
                defaultValue={initialAnswers.nickname}
              />
            </div>
          </div>
          <div className="space-y-3">
            <Label htmlFor="profilePhotos">3. 프로필 사진</Label>
            <Input
              id="profilePhotos"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              disabled={photos.length >= MAX_PHOTOS}
              aria-describedby="photo-help"
              onChange={(event) => {
                const files = Array.from(event.currentTarget.files ?? []);
                event.currentTarget.value = "";
                void upload(files);
              }}
            />
            <p id="photo-help" className="text-sm text-muted-foreground">
              최소 1장, 최대 5장. 사진당 3MB 이하의 JPG, PNG, WebP. 사진은
              선택하면 저장되며, 삭제는 중간 저장 또는 제출 시 반영됩니다.
            </p>
            {photos.length ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {photos.map((photo, index) => (
                  <div key={photo.path} className="space-y-2">
                    <Image
                      src={photo.url}
                      alt={`프로필 사진 ${index + 1}`}
                      width={240}
                      height={240}
                      unoptimized
                      className="aspect-square w-full rounded-lg object-cover"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={() =>
                        setPhotos((previous) =>
                          previous.filter((item) => item.path !== photo.path),
                        )
                      }
                    >
                      사진 {index + 1} 삭제
                    </Button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="lectureItem">4. 강의 아이템</Label>
            <Textarea
              id="lectureItem"
              name="lectureItem"
              rows={4}
              maxLength={3000}
              defaultValue={initialAnswers.lectureItem}
              placeholder="강의 주제와 가르칠 내용을 작성해 주세요."
            />
          </div>
        </section>
        <section className={sectionClass}>
          <h2 className="text-lg font-semibold">강의 경험과 자료</h2>
          <div className="space-y-2">
            <Label htmlFor="hasTeachingExperience">5. 기존 강의 여부</Label>
            <select
              id="hasTeachingExperience"
              name="hasTeachingExperience"
              defaultValue={
                initialAnswers.hasTeachingExperience === null
                  ? ""
                  : initialAnswers.hasTeachingExperience
                    ? "yes"
                    : "no"
              }
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            >
              <option value="">선택해 주세요</option>
              <option value="no">기존 강의 없음</option>
              <option value="yes">기존 강의 있음</option>
            </select>
          </div>
          {answers.hasTeachingExperience ? (
            <div className="grid gap-5 sm:grid-cols-2">
              <NumericField
                name="teachingCount"
                label="강의 횟수 (회)"
                value={answers.teachingCount}
                min={1}
              />
              <NumericField
                name="studentCount"
                label="누적 수강생 규모 (명)"
                value={answers.studentCount}
                min={1}
              />
            </div>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="materialsUrls">
              6. 강의 자료·무료강의 영상 드라이브 URL
            </Label>
            <Textarea
              id="materialsUrls"
              name="materialsUrls"
              rows={3}
              defaultValue={initialAnswers.materialsUrls.join("\n")}
              disabled={answers.materialsUnavailable}
              placeholder="https://drive.google.com/..."
              aria-describedby="materials-help"
            />
            <p id="materials-help" className="text-sm text-muted-foreground">
              자료가 저장된 드라이브 링크를 한 줄에 하나씩, 최대 10개 입력하고
              열람 권한을 확인해 주세요.
            </p>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="materialsUnavailable"
                defaultChecked={initialAnswers.materialsUnavailable}
              />
              기존 자료·무료강의 영상 없음
            </label>
          </div>
          <div className="space-y-2">
            <Label htmlFor="youtubeUrls">7. 유튜브 출연 영상 URL</Label>
            <Textarea
              id="youtubeUrls"
              name="youtubeUrls"
              rows={3}
              defaultValue={initialAnswers.youtubeUrls.join("\n")}
              disabled={answers.youtubeUnavailable}
              placeholder="https://www.youtube.com/watch?v=..."
            />
            <p className="text-sm text-muted-foreground">
              영상 링크를 한 줄에 하나씩, 최대 10개 입력해 주세요.
            </p>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="youtubeUnavailable"
                defaultChecked={initialAnswers.youtubeUnavailable}
              />
              유튜브 출연 영상 없음
            </label>
          </div>
        </section>
        <section className={sectionClass}>
          <h2 className="text-lg font-semibold">매출과 순이익</h2>
          <div className="grid gap-5 sm:grid-cols-2">
            <NumericField
              name="monthlyRevenue"
              label="8. 강의 외 월 매출 (원)"
              value={initialAnswers.monthlyRevenue}
              help="강의 수입을 제외하고 해당 아이템으로 낸 월 매출을 입력해 주세요. 매출이 없으면 0원입니다."
            />
            <NumericField
              name="monthlyProfit"
              label="9. 월 순이익 (원)"
              value={initialAnswers.monthlyProfit}
              min={-1_000_000_000_000}
              help="해당 매출에서 비용을 뺀 월 순이익입니다. 적자는 음수로 입력할 수 있습니다."
            />
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <NumericField
              name="expectedRevenue"
              label="10. 수강생 예상 월 매출 (원)"
              value={initialAnswers.expectedRevenue}
              help="수강 이후 3개월 내 달성 가능한 월 매출 예상치를 입력해 주세요."
            />
            <NumericField
              name="expectedProfit"
              label="수강생 예상 월 순이익 (원)"
              value={initialAnswers.expectedProfit}
              min={-1_000_000_000_000}
              help="같은 기간 달성 가능한 월 순이익 예상치를 입력해 주세요."
            />
          </div>
        </section>
        <section className={sectionClass}>
          <h2 className="text-lg font-semibold">수강생 출연</h2>
          <NumericField
            name="availableStudents"
            label="11. 무료강의 출연 가능 수강생 (명)"
            value={initialAnswers.availableStudents}
            min={3}
            help="무료강의에 출연 가능한 수강생은 최소 3명부터 입력해 주세요."
          />
        </section>
      </fieldset>
      <div className="sticky bottom-0 space-y-3 rounded-xl border bg-background/95 p-4 backdrop-blur">
        {message ? (
          <p role="status" className="text-sm">
            {message}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            disabled={busy}
            onClick={() => save(false)}
          >
            중간 저장
          </Button>
          <Button type="submit" className="flex-1" disabled={busy}>
            {busy ? "저장 중…" : "정보 제출"}
          </Button>
        </div>
      </div>
    </form>
  );
}
