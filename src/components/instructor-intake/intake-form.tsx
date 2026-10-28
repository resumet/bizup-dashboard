"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  FIELD_DESCRIPTION_LINKS,
  MATERIAL_IMAGE_LABELS,
  MAX_MATERIAL_IMAGES,
  MAX_PHOTO_BYTES,
  MAX_PHOTOS,
  formatWonWithKorean,
  saveSchema,
  type Answers,
  type ImagePaths,
  type ImagePhotos,
  type IntakeExamples,
  type MaterialImageCategory,
  type Photo,
} from "@/lib/instructor-intake/model";
import { IntakeProgress } from "./progress";

const sectionClass = "space-y-5 rounded-xl border bg-card p-5 sm:p-6";
function readAnswers(form: HTMLFormElement): Answers {
  const data = new FormData(form);
  const text = (key: string) => String(data.get(key) ?? "").trim();
  const number = (key: string) => text(key) === "" ? null : Number(text(key).replaceAll(",", ""));
  const urls = (key: string) => text(key).split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
  const experience = text("hasTeachingExperience");
  return {
    realName: text("realName"), nickname: text("nickname"), lectureItem: text("lectureItem"),
    courseContentIntroduction: text("courseContentIntroduction"), instructorCareer: text("instructorCareer"),
    studentSuccessDescription: text("studentSuccessDescription"), differentiators: text("differentiators"),
    webinarCoreContents: Array.from({ length: 5 }, (_, index) => text(`webinarCoreContent${index}`)),
    fieldStrengths: text("fieldStrengths"), recommendedAudience: text("recommendedAudience"),
    webinarBenefits: text("webinarBenefits"), opportunityEvidence: text("opportunityEvidence"),
    hasTeachingExperience: experience === "" ? null : experience === "yes",
    teachingCount: experience === "yes" ? number("teachingCount") : null,
    studentCount: experience === "yes" ? number("studentCount") : null,
    materialsUrls: data.has("materialsUnavailable") ? [] : urls("materialsUrls"),
    materialsUnavailable: data.has("materialsUnavailable"),
    youtubeUrls: data.has("youtubeUnavailable") ? [] : urls("youtubeUrls"),
    youtubeUnavailable: data.has("youtubeUnavailable"),
    monthlyRevenue: number("monthlyRevenue"), monthlyProfit: number("monthlyProfit"),
    expectedRevenue: number("expectedRevenue"), expectedProfit: number("expectedProfit"),
    availableStudents: number("availableStudents"), instagramAccountId: text("instagramAccountId"),
    instagramAccountPassword: text("instagramAccountPassword"), blueBadge: text("blueBadge"),
    twoFactorSecurity: text("twoFactorSecurity"), infokLinkId: text("infokLinkId"),
    infokLinkPassword: text("infokLinkPassword"),
  };
}

function pathsOf(groups: ImagePhotos): ImagePaths {
  return {
    evidence: groups.evidence.map((photo) => photo.path),
    studentResults: groups.studentResults.map((photo) => photo.path),
    reviews: groups.reviews.map((photo) => photo.path),
    opportunity: groups.opportunity.map((photo) => photo.path),
  };
}

function ExampleButton({ title, content }: { title: string; content: string }) {
  return <Dialog>
    <DialogTrigger asChild><Button type="button" size="sm" variant="outline">예시 보기</Button></DialogTrigger>
    <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader><DialogTitle>{title} 예시</DialogTitle></DialogHeader>
      <div className="whitespace-pre-wrap rounded-lg bg-muted p-4 text-sm leading-7">{content}</div>
    </DialogContent>
  </Dialog>;
}

function PhotoTile({ photo, alt, onDelete, disabled }: { photo: Photo; alt: string; onDelete: () => void; disabled: boolean }) {
  return <div className="space-y-2">
    <Dialog>
      <DialogTrigger asChild><button type="button" className="block w-full overflow-hidden rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Image src={photo.url} alt={alt} width={320} height={240} unoptimized className="aspect-[4/3] w-full object-cover" />
      </button></DialogTrigger>
      <DialogContent className="max-h-[92dvh] max-w-5xl overflow-auto p-3" aria-describedby={undefined}>
        <DialogHeader className="sr-only"><DialogTitle>{alt}</DialogTitle></DialogHeader>
        <Image src={photo.url} alt={alt} width={1600} height={1200} unoptimized className="h-auto max-h-[85dvh] w-full object-contain" />
      </DialogContent>
    </Dialog>
    <Button type="button" size="sm" variant="outline" className="w-full" disabled={disabled} onClick={onDelete}>삭제</Button>
  </div>;
}

function ImageExamples({ title, photos }: { title: string; photos: Photo[] }) {
  if (!photos.length) return null;
  return <Dialog>
    <DialogTrigger asChild><Button type="button" size="sm" variant="outline">예시 사진 보기</Button></DialogTrigger>
    <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-4xl">
      <DialogHeader><DialogTitle>{title} 예시 사진</DialogTitle></DialogHeader>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{photos.map((photo, index) => <a key={photo.path} href={photo.url} target="_blank" rel="noopener noreferrer"><Image src={photo.url} alt={`${title} 예시 ${index + 1}`} width={360} height={270} unoptimized className="aspect-[4/3] w-full rounded-lg object-cover" /></a>)}</div>
    </DialogContent>
  </Dialog>;
}

function ImageUploadField({ category, photos, examples, disabled, onUpload, onDelete }: {
  category: MaterialImageCategory; photos: Photo[]; examples: Photo[]; disabled: boolean;
  onUpload: (files: File[]) => void; onDelete: (path: string) => void;
}) {
  const label = MATERIAL_IMAGE_LABELS[category];
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Label htmlFor={`images-${category}`}>이미지 자료</Label>
      <ImageExamples title={label} photos={examples} />
    </div>
    <Input id={`images-${category}`} type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={disabled || photos.length >= MAX_MATERIAL_IMAGES} onChange={(event) => { const files = Array.from(event.currentTarget.files ?? []); event.currentTarget.value = ""; onUpload(files); }} />
    <p className="text-sm text-muted-foreground">최대 {MAX_MATERIAL_IMAGES}장, 사진당 3MB 이하. 사진을 누르면 크게 볼 수 있습니다.</p>
    {photos.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{photos.map((photo, index) => <PhotoTile key={photo.path} photo={photo} alt={`${label} ${index + 1}`} disabled={disabled} onDelete={() => onDelete(photo.path)} />)}</div> : null}
  </div>;
}

function DescriptionLink({ fieldIndex }: { fieldIndex: number }) {
  return <a href={FIELD_DESCRIPTION_LINKS[fieldIndex]} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-primary underline underline-offset-4">(설명보기)</a>;
}

function NumericField({ name, label, value, min = 0, help }: { name: string; label: string; value: number | null; min?: number; help?: string }) {
  return <div className="space-y-2"><Label htmlFor={name}>{label}</Label><Input id={name} name={name} type="number" inputMode={min < 0 ? "text" : "numeric"} min={min} max={name === "availableStudents" ? 100_000 : 1_000_000_000_000} step="1" defaultValue={value ?? ""} />{help ? <p className="text-sm text-muted-foreground">{help}</p> : null}</div>;
}

function MoneyField({ name, label, value, min = 0, help }: { name: string; label: string; value: number | null; min?: number; help?: string }) {
  const [raw, setRaw] = useState(value === null ? "" : String(value));
  const numeric = raw === "" || raw === "-" ? null : Number(raw.replaceAll(",", ""));
  const shown = numeric === null || !Number.isFinite(numeric) ? "" : formatWonWithKorean(numeric);
  return <div className="space-y-2"><Label htmlFor={name}>{label}</Label><Input id={name} name={name} type="text" inputMode="numeric" value={raw === "" || raw === "-" ? raw : Number(raw.replaceAll(",", "")).toLocaleString("ko-KR")} onChange={(event) => { const next = event.target.value.replaceAll(",", "").replace(/[^\d-]/g, "").replace(/(?!^)-/g, ""); if (next === "" || next === "-" || /^-?\d{0,13}$/.test(next)) setRaw(next); }} min={min} />{shown ? <p className="text-sm font-medium text-primary">{shown}</p> : null}{help ? <p className="text-sm text-muted-foreground">{help}</p> : null}</div>;
}

export function IntakeForm({ token, initialAnswers, initialPhotos, initialImages, exampleImages, examples, initialRevision, submittedAt }: {
  token: string; initialAnswers: Answers; initialPhotos: Photo[]; initialImages: ImagePhotos;
  exampleImages: ImagePhotos; examples: IntakeExamples; initialRevision: number; submittedAt: string | null;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [answers, setAnswers] = useState(initialAnswers);
  const [photos, setPhotos] = useState(initialPhotos);
  const [images, setImages] = useState(initialImages);
  const [revision, setRevision] = useState(initialRevision);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(submittedAt ? "제출된 정보입니다. 수정 후 다시 제출할 수 있습니다." : "");
  const [error, setError] = useState("");
  const imagePaths = pathsOf(images);

  async function save(submit: boolean) {
    if (!formRef.current || busy) return;
    setError(""); setMessage("");
    const parsed = saveSchema.safeParse({ answers: readAnswers(formRef.current), photoPaths: photos.map((photo) => photo.path), imagePaths, revision, submit });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요."); return; }
    setBusy(true);
    try {
      const response = await fetch(`/api/public/instructor-intakes/${token}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.data) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      setRevision(result.revision); setAnswers(parsed.data.answers);
      setMessage(submit ? "강사 정보를 제출했습니다. 감사합니다." : "현재까지 작성한 정보를 저장했습니다. 같은 링크에서 이어서 작성할 수 있습니다.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "저장하지 못했습니다. 다시 시도해 주세요."); }
    finally { setBusy(false); }
  }

  async function upload(files: File[], category?: MaterialImageCategory) {
    if (!files.length || busy) return;
    setError(""); setMessage("");
    const currentCount = category ? images[category].length : photos.length;
    const limit = category ? MAX_MATERIAL_IMAGES : MAX_PHOTOS;
    if (currentCount + files.length > limit) { setError(`사진은 최대 ${limit}장까지 추가할 수 있습니다.`); return; }
    if (files.some((file) => file.size > MAX_PHOTO_BYTES || !["image/jpeg", "image/png", "image/webp"].includes(file.type))) { setError("사진은 3MB 이하의 JPG, PNG, WebP 파일을 선택해 주세요."); return; }
    setBusy(true);
    let currentRevision = revision;
    try {
      for (const file of files) {
        const data = new FormData(); data.set("photo", file); data.set("revision", String(currentRevision));
        if (category) data.set("category", category);
        const response = await fetch(`/api/public/instructor-intakes/${token}/photos`, { method: "POST", body: data });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message);
        currentRevision = result.revision; setRevision(currentRevision);
        if (category) setImages((previous) => ({ ...previous, [category]: [...previous[category], result.photo] }));
        else setPhotos((previous) => [...previous, result.photo]);
      }
      setMessage("사진을 저장했습니다. 작성한 내용도 중간 저장하거나 제출해 주세요.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "사진을 저장하지 못했습니다."); }
    finally { setBusy(false); }
  }

  return <form ref={formRef} className="space-y-6" noValidate onChange={() => { if (formRef.current) setAnswers(readAnswers(formRef.current)); }} onSubmit={(event) => { event.preventDefault(); void save(true); }}>
    <IntakeProgress answers={answers} photoCount={photos.length} imagePaths={imagePaths} />
    <fieldset disabled={busy} className="space-y-6">
      <section className={sectionClass}>
        <h2 className="text-lg font-semibold">기본 정보</h2>
        <div className="grid gap-5 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="realName">1. 본명</Label><Input id="realName" name="realName" autoComplete="name" maxLength={80} defaultValue={initialAnswers.realName} /></div><div className="space-y-2"><Label htmlFor="nickname">2. 닉네임</Label><Input id="nickname" name="nickname" maxLength={80} defaultValue={initialAnswers.nickname} /></div></div>
        <div className="space-y-3"><Label htmlFor="profilePhotos">3. 프로필 사진</Label><Input id="profilePhotos" type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={photos.length >= MAX_PHOTOS} onChange={(event) => { const files = Array.from(event.currentTarget.files ?? []); event.currentTarget.value = ""; void upload(files); }} /><p className="text-sm text-muted-foreground">최소 1장, 최대 5장. 사진당 3MB 이하의 JPG, PNG, WebP.</p>{photos.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{photos.map((photo, index) => <PhotoTile key={photo.path} photo={photo} alt={`프로필 사진 ${index + 1}`} disabled={busy} onDelete={() => setPhotos((previous) => previous.filter((item) => item.path !== photo.path))} />)}</div> : null}</div>
        <div className="space-y-2"><Label htmlFor="lectureItem">4. 강의아이템 한줄소개</Label><Input id="lectureItem" name="lectureItem" maxLength={3000} defaultValue={initialAnswers.lectureItem} placeholder="한 문장으로 강의의 핵심 매력을 소개해 주세요." /><div className="rounded-lg bg-muted p-3 text-sm"><p className="mb-1 font-medium">예시</p><ul className="list-disc space-y-1 pl-5">{examples.lectureItemExamples.map((example) => <li key={example}>{example}</li>)}</ul></div></div>
      </section>

      <section className={sectionClass}>
        <div className="flex flex-wrap items-center justify-between gap-3"><Label htmlFor="courseContentIntroduction" className="text-base">5. 강의 내용 소개</Label><ExampleButton title="강의 내용 소개" content={examples.courseContentIntroduction} /></div>
        <Textarea id="courseContentIntroduction" name="courseContentIntroduction" rows={14} maxLength={12_000} defaultValue={initialAnswers.courseContentIntroduction} placeholder="강의에서 다룰 문제, 변화, 메시지를 구체적으로 작성해 주세요." />
      </section>
      <section className={sectionClass}>
        <div className="flex flex-wrap items-center justify-between gap-3"><Label htmlFor="instructorCareer" className="text-base">6. 강사 이력</Label><ExampleButton title="강사 이력" content={examples.instructorCareer} /></div>
        <Textarea id="instructorCareer" name="instructorCareer" rows={14} maxLength={12_000} defaultValue={initialAnswers.instructorCareer} placeholder="한 줄에 하나씩 주요 경력과 성과를 입력해 주세요." />
      </section>
      <section className={sectionClass}><h2 className="text-lg font-semibold">7. 증빙을 위한 자료 제출</h2><p className="text-sm text-muted-foreground">수강생과 함께 찍은 사진, 자격증, 매출 증빙 자료를 올려 주세요.</p><ImageUploadField category="evidence" photos={images.evidence} examples={exampleImages.evidence} disabled={busy} onUpload={(files) => void upload(files, "evidence")} onDelete={(path) => setImages((previous) => ({ ...previous, evidence: previous.evidence.filter((photo) => photo.path !== path) }))} /></section>
      <section className={sectionClass}>
        <h2 className="text-lg font-semibold">8. 수강생 성과 인증 자료</h2>
        <p className="text-sm text-muted-foreground">메인 성공 후기로 사용할 수강생 사진과 수익화 인증 자료를 올려 주세요.</p>
        <ImageUploadField category="studentResults" photos={images.studentResults} examples={exampleImages.studentResults} disabled={busy} onUpload={(files) => void upload(files, "studentResults")} onDelete={(path) => setImages((previous) => ({ ...previous, studentResults: previous.studentResults.filter((photo) => photo.path !== path) }))} />
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Label htmlFor="studentSuccessDescription">자세한 설명</Label>
            <ExampleButton title="수강생 성과 자세한 설명" content={examples.studentSuccessDescription} />
          </div>
          <Textarea id="studentSuccessDescription" name="studentSuccessDescription" rows={13} maxLength={12_000} defaultValue={initialAnswers.studentSuccessDescription} placeholder="성과가 만들어진 과정과 수강생의 변화를 자세히 작성해 주세요." />
        </div>
      </section>
      <section className={sectionClass}><h2 className="text-lg font-semibold">9. 수강후기</h2><p className="text-sm text-muted-foreground">수강생 사진과 카카오톡·수강후기 페이지의 후기 캡처를 올려 주세요.</p><ImageUploadField category="reviews" photos={images.reviews} examples={exampleImages.reviews} disabled={busy} onUpload={(files) => void upload(files, "reviews")} onDelete={(path) => setImages((previous) => ({ ...previous, reviews: previous.reviews.filter((photo) => photo.path !== path) }))} /></section>
      <section className={sectionClass}><div className="flex flex-wrap items-center justify-between gap-3"><Label htmlFor="differentiators" className="text-base">10. 강의 차별점</Label><ExampleButton title="강의 차별점" content={examples.differentiators} /></div><Textarea id="differentiators" name="differentiators" rows={8} maxLength={12_000} defaultValue={initialAnswers.differentiators} placeholder="1:1 피드백, 컨설팅, 현장 수업, 강의 성과 등 차별화된 장점을 작성해 주세요." /></section>
      <section className={sectionClass}>
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">11. 무료 웨비나를 통해 얻어갈 수 있는 핵심 내용</h2><ExampleButton title="무료 웨비나 핵심 내용" content={examples.webinarCoreContents.map((content, index) => `${index + 1}. ${content}`).join("\n")} /></div>
        <div className="space-y-3">{Array.from({ length: 5 }, (_, index) => <div key={index} className="space-y-2"><Label htmlFor={`webinarCoreContent${index}`}>핵심 내용 {index + 1}</Label><Input id={`webinarCoreContent${index}`} name={`webinarCoreContent${index}`} maxLength={1000} defaultValue={initialAnswers.webinarCoreContents[index] ?? ""} /></div>)}</div>
      </section>
      <section className={sectionClass}><div className="flex flex-wrap items-center justify-between gap-3"><Label htmlFor="fieldStrengths" className="text-base">12. 해당 분야 특장점</Label><ExampleButton title="해당 분야 특장점" content={examples.fieldStrengths} /></div><Textarea id="fieldStrengths" name="fieldStrengths" rows={10} maxLength={12_000} defaultValue={initialAnswers.fieldStrengths} placeholder="다른 사업분야와 비교했을 때 이 분야를 추천하는 이유를 작성해 주세요." /></section>
      <section className={sectionClass}><div className="flex flex-wrap items-center justify-between gap-3"><Label htmlFor="recommendedAudience" className="text-base">13. 강의 추천 대상</Label><ExampleButton title="강의 추천 대상" content={examples.recommendedAudience} /></div><Textarea id="recommendedAudience" name="recommendedAudience" rows={8} maxLength={12_000} defaultValue={initialAnswers.recommendedAudience} placeholder="강의를 듣기에 적합한 대상을 구체적으로 작성해 주세요." /></section>
      <section className={sectionClass}><div className="flex flex-wrap items-center justify-between gap-3"><Label htmlFor="webinarBenefits" className="text-base">14. 무료 웨비나 수강 혜택</Label><ExampleButton title="무료 웨비나 수강 혜택" content={examples.webinarBenefits} /></div><Textarea id="webinarBenefits" name="webinarBenefits" rows={7} maxLength={12_000} defaultValue={initialAnswers.webinarBenefits} placeholder="무료 PDF, 체크리스트, 상담권 등 참여 혜택을 작성해 주세요." /></section>
      <section className={sectionClass}><div className="flex flex-wrap items-center justify-between gap-3"><Label htmlFor="opportunityEvidence" className="text-base">15. 지금이 기회라는 정량적·정성적 증거</Label><ExampleButton title="지금이 기회라는 증거" content={examples.opportunityEvidence} /></div><Textarea id="opportunityEvidence" name="opportunityEvidence" rows={13} maxLength={12_000} defaultValue={initialAnswers.opportunityEvidence} placeholder="시장에 기회와 틈새가 존재한다는 정량적·정성적 근거를 작성해 주세요." /><ImageUploadField category="opportunity" photos={images.opportunity} examples={exampleImages.opportunity} disabled={busy} onUpload={(files) => void upload(files, "opportunity")} onDelete={(path) => setImages((previous) => ({ ...previous, opportunity: previous.opportunity.filter((photo) => photo.path !== path) }))} /></section>

      <section className={sectionClass}><h2 className="text-lg font-semibold">기존 강의 경험과 자료</h2><div className="space-y-2"><Label htmlFor="hasTeachingExperience">16. 기존 강의 여부</Label><select id="hasTeachingExperience" name="hasTeachingExperience" defaultValue={initialAnswers.hasTeachingExperience === null ? "" : initialAnswers.hasTeachingExperience ? "yes" : "no"} className="h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="">선택해 주세요</option><option value="no">기존 강의 없음</option><option value="yes">기존 강의 있음</option></select></div>{answers.hasTeachingExperience ? <div className="grid gap-5 sm:grid-cols-2"><NumericField name="teachingCount" label="강의 횟수 (회)" value={answers.teachingCount} min={1} /><NumericField name="studentCount" label="누적 수강생 규모 (명)" value={answers.studentCount} min={1} /></div> : null}<div className="space-y-2"><Label htmlFor="materialsUrls">17. 강의 자료·무료강의 영상 드라이브 URL</Label><Textarea id="materialsUrls" name="materialsUrls" rows={3} defaultValue={initialAnswers.materialsUrls.join("\n")} disabled={answers.materialsUnavailable} placeholder="https://drive.google.com/..." /><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="materialsUnavailable" defaultChecked={initialAnswers.materialsUnavailable} />기존 자료·무료강의 영상 없음</label></div><div className="space-y-2"><Label htmlFor="youtubeUrls">18. 유튜브 출연 영상 URL</Label><Textarea id="youtubeUrls" name="youtubeUrls" rows={3} defaultValue={initialAnswers.youtubeUrls.join("\n")} disabled={answers.youtubeUnavailable} placeholder="https://www.youtube.com/watch?v=..." /><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="youtubeUnavailable" defaultChecked={initialAnswers.youtubeUnavailable} />유튜브 출연 영상 없음</label></div></section>
      <section className={sectionClass}><h2 className="text-lg font-semibold">매출과 순이익</h2><div className="grid gap-5 sm:grid-cols-2"><MoneyField name="monthlyRevenue" label="19. 강의 외 월 매출 (원)" value={initialAnswers.monthlyRevenue} help="강의 수입을 제외한 월 매출입니다." /><MoneyField name="monthlyProfit" label="20. 월 순이익 (원)" value={initialAnswers.monthlyProfit} min={-1_000_000_000_000} help="적자는 음수로 입력할 수 있습니다." /></div><div className="grid gap-5 sm:grid-cols-2"><MoneyField name="expectedRevenue" label="21. 수강생 예상 월 매출 (원)" value={initialAnswers.expectedRevenue} /><MoneyField name="expectedProfit" label="수강생 예상 월 순이익 (원)" value={initialAnswers.expectedProfit} min={-1_000_000_000_000} /></div></section>
      <section className={sectionClass}><NumericField name="availableStudents" label="22. 무료강의 출연 가능 수강생 (명)" value={initialAnswers.availableStudents} min={3} help="최소 3명부터 입력해 주세요." /></section>
      <section className={sectionClass}><h2 className="text-lg font-semibold">계정 설정 정보</h2><div className="space-y-4"><div className="flex flex-wrap items-center gap-2"><p className="font-medium">23. 인스타 신규계정 생성후 아이디, 비밀번호</p><DescriptionLink fieldIndex={22} /></div><div className="grid gap-5 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="instagramAccountId">아이디</Label><Input id="instagramAccountId" name="instagramAccountId" maxLength={200} defaultValue={initialAnswers.instagramAccountId} /></div><div className="space-y-2"><Label htmlFor="instagramAccountPassword">비밀번호</Label><Input id="instagramAccountPassword" name="instagramAccountPassword" type="password" maxLength={500} defaultValue={initialAnswers.instagramAccountPassword} /></div></div></div><div className="space-y-2"><div className="flex gap-2"><Label htmlFor="blueBadge">24. 블루뱃지</Label><DescriptionLink fieldIndex={23} /></div><Textarea id="blueBadge" name="blueBadge" rows={3} maxLength={1000} defaultValue={initialAnswers.blueBadge} /></div><div className="space-y-2"><div className="flex gap-2"><Label htmlFor="twoFactorSecurity">25. 2차 보안</Label><DescriptionLink fieldIndex={24} /></div><Textarea id="twoFactorSecurity" name="twoFactorSecurity" rows={3} maxLength={1000} defaultValue={initialAnswers.twoFactorSecurity} /></div><div className="space-y-4"><div className="flex gap-2"><p className="font-medium">26. 인포크 링크 아이디, 비밀번호</p><DescriptionLink fieldIndex={25} /></div><div className="grid gap-5 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="infokLinkId">아이디</Label><Input id="infokLinkId" name="infokLinkId" maxLength={200} defaultValue={initialAnswers.infokLinkId} /></div><div className="space-y-2"><Label htmlFor="infokLinkPassword">비밀번호</Label><Input id="infokLinkPassword" name="infokLinkPassword" type="password" maxLength={500} defaultValue={initialAnswers.infokLinkPassword} /></div></div></div></section>
    </fieldset>
    <div className="sticky bottom-0 space-y-3 rounded-xl border bg-background/95 p-4 backdrop-blur">{message ? <p role="status" className="text-sm">{message}</p> : null}{error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}<div className="flex gap-3"><Button type="button" variant="outline" className="flex-1" disabled={busy} onClick={() => void save(false)}>중간 저장</Button><Button type="submit" className="flex-1" disabled={busy}>{busy ? "저장 중…" : "정보 제출"}</Button></div></div>
  </form>;
}
