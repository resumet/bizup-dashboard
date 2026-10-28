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
  type IntakeSettings,
  type MaterialImageCategory,
} from "@/lib/instructor-intake/model";

const categories: MaterialImageCategory[] = ["evidence", "studentResults", "reviews"];
const cardClass = "space-y-5 rounded-xl border bg-card p-5 sm:p-6";

export function IntakeSettingsEditor({ initialSettings, initialImages }: {
  initialSettings: IntakeSettings;
  initialImages: ImagePhotos;
}) {
  const [examples, setExamples] = useState(initialSettings.examples);
  const [images, setImages] = useState(initialImages);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function upload(category: MaterialImageCategory, files: File[]) {
    if (!files.length || busy) return;
    setError(""); setMessage("");
    if (images[category].length + files.length > MAX_MATERIAL_IMAGES) {
      setError(`항목별 예시 사진은 최대 ${MAX_MATERIAL_IMAGES}장입니다.`); return;
    }
    if (files.some((file) => file.size > MAX_PHOTO_BYTES || !["image/jpeg", "image/png", "image/webp"].includes(file.type))) {
      setError("사진은 3MB 이하의 JPG, PNG, WebP 파일을 선택해 주세요."); return;
    }
    setBusy(true);
    try {
      for (const file of files) {
        const form = new FormData();
        form.set("photo", file); form.set("category", category);
        const response = await fetch("/api/instructor-intakes/settings/photos", { method: "POST", body: form });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message);
        setImages((previous) => ({ ...previous, [category]: [...previous[category], result.photo] }));
      }
      setMessage("예시 사진을 저장했습니다.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "사진을 저장하지 못했습니다.");
    } finally { setBusy(false); }
  }

  async function save() {
    if (busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/instructor-intakes/settings", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ examples, exampleImagePaths: Object.fromEntries(Object.entries(images).map(([key, values]) => [key, values.map((image) => image.path)])) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      setMessage("강사에게 보여줄 예시를 저장했습니다.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "설정을 저장하지 못했습니다.");
    } finally { setBusy(false); }
  }

  return <div className="space-y-6">
    <section className={cardClass}>
      <div className="space-y-2">
        <Label htmlFor="lectureItemExamples">강의아이템 한줄소개 예시</Label>
        <Textarea id="lectureItemExamples" rows={5} value={examples.lectureItemExamples.join("\n")} onChange={(event) => setExamples((previous) => ({ ...previous, lectureItemExamples: event.target.value.split(/\r?\n/).map((value) => value.trim()).filter(Boolean).slice(0, 10) }))} />
        <p className="text-sm text-muted-foreground">강사에게 보여줄 예시를 한 줄에 하나씩 입력해 주세요.</p>
      </div>
      <ExampleTextarea id="courseContentIntroduction" label="강의 내용 소개 예시" value={examples.courseContentIntroduction} onChange={(value) => setExamples((previous) => ({ ...previous, courseContentIntroduction: value }))} />
      <ExampleTextarea id="instructorCareer" label="강사 이력 예시" value={examples.instructorCareer} onChange={(value) => setExamples((previous) => ({ ...previous, instructorCareer: value }))} />
      <ExampleTextarea id="differentiators" label="강의 차별점 예시" value={examples.differentiators} onChange={(value) => setExamples((previous) => ({ ...previous, differentiators: value }))} />
    </section>
    {categories.map((category) => <section key={category} className={cardClass}>
      <div className="space-y-2">
        <Label htmlFor={`example-${category}`}>{MATERIAL_IMAGE_LABELS[category]} 예시 사진</Label>
        <Input id={`example-${category}`} type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy || images[category].length >= MAX_MATERIAL_IMAGES} onChange={(event) => { const files = Array.from(event.currentTarget.files ?? []); event.currentTarget.value = ""; void upload(category, files); }} />
      </div>
      {images[category].length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {images[category].map((photo, index) => <div key={photo.path} className="space-y-2">
          <a href={photo.url} target="_blank" rel="noopener noreferrer"><Image src={photo.url} alt={`${MATERIAL_IMAGE_LABELS[category]} 예시 ${index + 1}`} width={260} height={200} unoptimized className="aspect-[4/3] w-full rounded-lg object-cover" /></a>
          <Button type="button" size="sm" variant="outline" className="w-full" disabled={busy} onClick={() => setImages((previous) => ({ ...previous, [category]: previous[category].filter((item) => item.path !== photo.path) }))}>삭제</Button>
        </div>)}
      </div> : null}
    </section>)}
    <div className="sticky bottom-0 space-y-2 rounded-xl border bg-background/95 p-4 backdrop-blur">
      {message ? <p role="status" className="text-sm">{message}</p> : null}
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <Button className="w-full" disabled={busy || examples.lectureItemExamples.length === 0} onClick={() => void save()}>{busy ? "저장 중…" : "예시 설정 저장"}</Button>
    </div>
  </div>;
}

function ExampleTextarea({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (value: string) => void }) {
  return <div className="space-y-2">
    <Label htmlFor={id}>{label}</Label>
    <Textarea id={id} rows={10} maxLength={12_000} value={value} onChange={(event) => onChange(event.target.value)} />
  </div>;
}
