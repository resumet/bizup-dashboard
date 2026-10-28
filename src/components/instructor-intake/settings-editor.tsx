"use client";

import Image from "next/image";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  MATERIAL_IMAGE_LABELS,
  MAX_MATERIAL_IMAGES,
  MAX_PHOTO_BYTES,
  type ImagePhotos,
  type IntakeExamples,
  type IntakeSettings,
  type MaterialImageCategory,
} from "@/lib/instructor-intake/model";

const imageSections: Array<{
  category: MaterialImageCategory;
  number: number;
  title: string;
}> = [
  { category: "evidence", number: 7, title: "증빙을 위한 자료 제출" },
  { category: "studentResults", number: 8, title: "수강생 성과 인증 자료" },
  { category: "reviews", number: 9, title: "수강후기" },
  { category: "opportunity", number: 15, title: "지금이 기회라는 증거" },
];

const textSections: Array<{
  field: Exclude<keyof IntakeExamples, "lectureItemExamples" | "webinarCoreContents">;
  number: number;
  title: string;
  rows: number;
}> = [
  { field: "courseContentIntroduction", number: 5, title: "강의 내용 소개", rows: 12 },
  { field: "instructorCareer", number: 6, title: "강사 이력", rows: 12 },
  { field: "studentSuccessDescription", number: 8, title: "수강생 성과 자세한 설명", rows: 12 },
  { field: "differentiators", number: 10, title: "강의 차별점", rows: 8 },
  { field: "fieldStrengths", number: 12, title: "해당 분야 특장점", rows: 10 },
  { field: "recommendedAudience", number: 13, title: "강의 추천 대상", rows: 8 },
  { field: "webinarBenefits", number: 14, title: "무료 웨비나 수강 혜택", rows: 7 },
  { field: "opportunityEvidence", number: 15, title: "지금이 기회라는 정량적·정성적 증거", rows: 12 },
];

const cardClass = "space-y-5 rounded-xl border bg-card p-5 sm:p-6";

export function IntakeSettingsEditor({
  initialSettings,
  initialImages,
}: {
  initialSettings: IntakeSettings;
  initialImages: ImagePhotos;
}) {
  const [examples, setExamples] = useState(initialSettings.examples);
  const [images, setImages] = useState(initialImages);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function updateText(field: (typeof textSections)[number]["field"], value: string) {
    setExamples((previous) => ({ ...previous, [field]: value }));
  }

  async function upload(category: MaterialImageCategory, files: File[]) {
    if (!files.length || busy) return;
    setError("");
    setMessage("");
    if (images[category].length + files.length > MAX_MATERIAL_IMAGES) {
      setError(`항목별 예시 사진은 최대 ${MAX_MATERIAL_IMAGES}장입니다.`);
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
    try {
      for (const file of files) {
        const form = new FormData();
        form.set("photo", file);
        form.set("category", category);
        const response = await fetch(
          "/api/instructor-intakes/settings/photos",
          { method: "POST", body: form },
        );
        const result = await response.json();
        if (!response.ok) throw new Error(result.message);
        setImages((previous) => ({
          ...previous,
          [category]: [...previous[category], result.photo],
        }));
      }
      setMessage("예시 사진을 저장했습니다.");
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

  async function save() {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/instructor-intakes/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          examples,
          exampleImagePaths: Object.fromEntries(
            Object.entries(images).map(([key, values]) => [
              key,
              values.map((image) => image.path),
            ]),
          ),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      setMessage("강사에게 보여줄 예시를 저장했습니다.");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "설정을 저장하지 못했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className={cardClass}>
        <h2 className="text-lg font-semibold">4. 강의아이템 한줄소개 예시</h2>
        <div className="space-y-2">
          <Label htmlFor="lectureItemExamples">예시 문장</Label>
          <Textarea
            id="lectureItemExamples"
            rows={5}
            value={examples.lectureItemExamples.join("\n")}
            onChange={(event) =>
              setExamples((previous) => ({
                ...previous,
                lectureItemExamples: event.target.value
                  .split(/\r?\n/)
                  .map((value) => value.trim())
                  .filter(Boolean)
                  .slice(0, 10),
              }))
            }
          />
          <p className="text-sm text-muted-foreground">
            한 줄에 하나씩 최대 10개까지 입력해 주세요.
          </p>
        </div>
      </section>

      {textSections.slice(0, 2).map((section) => (
        <TextExampleSection
          key={section.field}
          {...section}
          value={examples[section.field]}
          onChange={(value) => updateText(section.field, value)}
        />
      ))}

      <ImageExampleSection
        section={imageSections[0]}
        images={images}
        busy={busy}
        onUpload={upload}
        onDelete={setImages}
      />

      <TextExampleSection
        {...textSections[2]}
        value={examples.studentSuccessDescription}
        onChange={(value) => updateText("studentSuccessDescription", value)}
      />
      <ImageExampleSection
        section={imageSections[1]}
        images={images}
        busy={busy}
        onUpload={upload}
        onDelete={setImages}
      />
      <ImageExampleSection
        section={imageSections[2]}
        images={images}
        busy={busy}
        onUpload={upload}
        onDelete={setImages}
      />

      <TextExampleSection
        {...textSections[3]}
        value={examples.differentiators}
        onChange={(value) => updateText("differentiators", value)}
      />

      <section className={cardClass}>
        <h2 className="text-lg font-semibold">11. 무료 웨비나 핵심 내용 예시</h2>
        <div className="space-y-3">
          {examples.webinarCoreContents.map((content, index) => (
            <div key={index} className="space-y-2">
              <Label htmlFor={`core-example-${index}`}>핵심 내용 {index + 1}</Label>
              <Input
                id={`core-example-${index}`}
                maxLength={1000}
                value={content}
                onChange={(event) =>
                  setExamples((previous) => ({
                    ...previous,
                    webinarCoreContents: previous.webinarCoreContents.map(
                      (item, itemIndex) =>
                        itemIndex === index ? event.target.value : item,
                    ),
                  }))
                }
              />
            </div>
          ))}
        </div>
      </section>

      {textSections.slice(4, 7).map((section) => (
        <TextExampleSection
          key={section.field}
          {...section}
          value={examples[section.field]}
          onChange={(value) => updateText(section.field, value)}
        />
      ))}

      <TextExampleSection
        {...textSections[7]}
        value={examples.opportunityEvidence}
        onChange={(value) => updateText("opportunityEvidence", value)}
      />
      <ImageExampleSection
        section={imageSections[3]}
        images={images}
        busy={busy}
        onUpload={upload}
        onDelete={setImages}
      />

      <div className="sticky bottom-0 space-y-2 rounded-xl border bg-background/95 p-4 backdrop-blur">
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
        <Button
          className="w-full"
          disabled={busy || examples.lectureItemExamples.length === 0}
          onClick={() => void save()}
        >
          {busy ? "저장 중…" : "예시 설정 저장"}
        </Button>
      </div>
    </div>
  );
}

function TextExampleSection({
  number,
  title,
  rows,
  value,
  onChange,
}: {
  number: number;
  title: string;
  rows: number;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <section className={cardClass}>
      <h2 className="text-lg font-semibold">
        {number}. {title} 예시
      </h2>
      <div className="space-y-2">
        <Label htmlFor={`example-text-${number}`}>예시 문장</Label>
        <Textarea
          id={`example-text-${number}`}
          rows={rows}
          maxLength={12_000}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    </section>
  );
}

function ImageExampleSection({
  section,
  images,
  busy,
  onUpload,
  onDelete,
}: {
  section: (typeof imageSections)[number];
  images: ImagePhotos;
  busy: boolean;
  onUpload: (category: MaterialImageCategory, files: File[]) => Promise<void>;
  onDelete: React.Dispatch<React.SetStateAction<ImagePhotos>>;
}) {
  const { category, number, title } = section;
  return (
    <section className={cardClass}>
      <h2 className="text-lg font-semibold">
        {number}. {title} 예시 이미지
      </h2>
      <div className="space-y-2">
        <Label htmlFor={`example-${category}`}>
          {MATERIAL_IMAGE_LABELS[category]} 예시 사진
        </Label>
        <Input
          id={`example-${category}`}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          disabled={busy || images[category].length >= MAX_MATERIAL_IMAGES}
          onChange={(event) => {
            const files = Array.from(event.currentTarget.files ?? []);
            event.currentTarget.value = "";
            void onUpload(category, files);
          }}
        />
      </div>
      {images[category].length ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {images[category].map((photo, index) => (
            <div key={photo.path} className="space-y-2">
              <a href={photo.url} target="_blank" rel="noopener noreferrer">
                <Image
                  src={photo.url}
                  alt={`${MATERIAL_IMAGE_LABELS[category]} 예시 ${index + 1}`}
                  width={260}
                  height={200}
                  unoptimized
                  className="aspect-[4/3] w-full rounded-lg object-cover"
                />
              </a>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="w-full"
                disabled={busy}
                onClick={() =>
                  onDelete((previous) => ({
                    ...previous,
                    [category]: previous[category].filter(
                      (item) => item.path !== photo.path,
                    ),
                  }))
                }
              >
                삭제
              </Button>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
