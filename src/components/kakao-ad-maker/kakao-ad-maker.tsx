"use client";

import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  Clipboard,
  Copy,
  FileImage,
  ImagePlus,
  Loader2,
  MoreVertical,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
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
  AD_STRATEGIES,
  PROGRESS_STATUSES,
  STRATEGY_META,
  createEmptyAdProject,
  type AdAsset,
  type AdMaterial,
  type AdProject,
  type AdStrategy,
  type StyleProfile,
} from "@/lib/kakao-ad-maker/types";
import { validateAdProject } from "@/lib/kakao-ad-maker/validation";

const STORAGE_KEY = "bizup:kakao-ad-maker:projects:v1";
const STEPS = ["강의 기본 정보", "특징과 핵심 타깃", "강사 이력과 사진", "혜택과 스타일"];

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

async function resizeImage(file: File) {
  if (!/^image\/(?:jpeg|png|webp)$/u.test(file.type)) throw new Error("JPG, PNG, WebP 이미지만 업로드할 수 있습니다.");
  if (file.size > 12 * 1024 * 1024) throw new Error("이미지 한 장은 12MB 이하여야 합니다.");
  const source = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = source;
    await image.decode();
    const scale = Math.min(1, 1400 / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.width * scale);
    canvas.height = Math.round(image.height * scale);
    canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/webp", 0.84);
  } finally {
    URL.revokeObjectURL(source);
  }
}

function ProjectDashboard({
  projects,
  onNew,
  onOpen,
  onDuplicate,
  onDelete,
}: {
  projects: AdProject[];
  onNew: () => void;
  onOpen: (project: AdProject) => void;
  onDuplicate: (project: AdProject) => void;
  onDelete: (project: AdProject) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">홍보소재 프로젝트</h2>
          <p className="mt-1 text-sm text-muted-foreground">강의별 입력과 5개 전략 프롬프트를 저장하고 재사용합니다.</p>
        </div>
        <Button size="lg" onClick={onNew}><Plus /> 새 홍보소재 만들기</Button>
      </div>
      {projects.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex min-h-72 flex-col items-center justify-center text-center">
            <FileImage className="size-12 text-primary" />
            <h3 className="mt-4 text-lg font-semibold">아직 만든 프로젝트가 없습니다</h3>
            <p className="mt-1 text-sm text-muted-foreground">강의 정보를 한 번 입력하고 서로 다른 5개 홍보소재 프롬프트를 만드세요.</p>
            <Button className="mt-5" onClick={onNew}><Sparkles /> 첫 프로젝트 만들기</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => (
            <Card key={project.id} className="overflow-hidden">
              {project.materials[0]?.imagePrompt ? (
                <div className="flex aspect-[16/9] flex-col justify-between bg-muted p-5">
                  <Badge className="w-fit">{STRATEGY_META[project.materials[0].strategy].label}</Badge>
                  <p className="line-clamp-4 text-sm leading-relaxed text-muted-foreground">{project.materials[0].imagePrompt}</p>
                  <span className="text-xs font-semibold">1600×900 · 16:9</span>
                </div>
              ) : (
                <div className="grid aspect-[16/9] place-items-center bg-muted"><ImagePlus className="size-10 text-muted-foreground" /></div>
              )}
              <CardHeader className="pb-3">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <CardTitle className="truncate">{project.lectureName || project.name}</CardTitle>
                    <CardDescription className="mt-1 truncate">{project.instructorName || "강사 미입력"}</CardDescription>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="프로젝트 메뉴"><MoreVertical /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onDuplicate(project)}><Copy /> 복제</DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" onClick={() => onDelete(project)}><Trash2 /> 삭제</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent className="flex items-center gap-2 pt-0">
                <Badge variant="secondary">{project.progressStatus}</Badge>
                <span className="text-xs text-muted-foreground">{formatDate(project.updatedAt)}</span>
                <Button className="ml-auto" variant="outline" onClick={() => onOpen(project)}>열기</Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function ArrayFields({
  label,
  values,
  onChange,
  minimum = 0,
  maximum = 12,
  reorder = false,
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  minimum?: number;
  maximum?: number;
  reorder?: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <Button type="button" variant="outline" size="sm" disabled={values.length >= maximum} onClick={() => onChange([...values, ""])}><Plus /> 추가</Button>
      </div>
      {values.map((value, index) => (
        <div key={index} className="flex items-center gap-2">
          <Input value={value} placeholder={`${label} ${index + 1}`} onChange={(event) => onChange(values.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} />
          {reorder ? <>
            <Button type="button" variant="ghost" size="icon-sm" disabled={index === 0} aria-label="위로" onClick={() => { const copy = [...values]; [copy[index - 1], copy[index]] = [copy[index], copy[index - 1]]; onChange(copy); }}><ArrowUp /></Button>
            <Button type="button" variant="ghost" size="icon-sm" disabled={index === values.length - 1} aria-label="아래로" onClick={() => { const copy = [...values]; [copy[index + 1], copy[index]] = [copy[index], copy[index + 1]]; onChange(copy); }}><ArrowDown /></Button>
          </> : null}
          <Button type="button" variant="ghost" size="icon-sm" disabled={values.length <= minimum} aria-label="삭제" onClick={() => onChange(values.filter((_, itemIndex) => itemIndex !== index))}><X /></Button>
        </div>
      ))}
    </div>
  );
}

function AssetUploader({
  project,
  type,
  title,
  maximum,
  onChange,
}: {
  project: AdProject;
  type: AdAsset["type"];
  title: string;
  maximum: number;
  onChange: (assets: AdAsset[]) => void;
}) {
  const assets = project.assets.filter((asset) => asset.type === type);
  async function upload(files: FileList | null) {
    if (!files) return;
    try {
      const selected = [...files].slice(0, maximum - assets.length);
      const created = await Promise.all(selected.map(async (file, index) => ({
        id: crypto.randomUUID(),
        type,
        name: file.name,
        mimeType: "image/webp",
        dataUrl: await resizeImage(file),
        isPrimary: type === "instructor" && assets.length === 0 && index === 0,
        purpose: type === "reference" ? "전체 분위기" : undefined,
        importance: type === "reference" ? "보통" as const : undefined,
        memo: "",
        enabled: true,
        applyToStrategies: type === "reference" ? [...AD_STRATEGIES] : undefined,
      })));
      onChange([...project.assets, ...created]);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "이미지를 처리하지 못했습니다.");
    }
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div><Label>{title}</Label><p className="text-xs text-muted-foreground">{assets.length}/{maximum}장</p></div>
        <Button type="button" variant="outline" className="relative overflow-hidden" disabled={assets.length >= maximum}><ImagePlus /> 이미지 추가<input type="file" accept="image/jpeg,image/png,image/webp" multiple className="absolute inset-0 cursor-pointer opacity-0" aria-label={`${title} 추가`} onChange={(event) => void upload(event.target.files)} /></Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {assets.map((asset) => (
          <div key={asset.id} className="rounded-xl border p-3">
            <div className="aspect-[4/3] rounded-lg bg-muted bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url(${asset.dataUrl})` }} />
            <div className="mt-2 flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-xs">{asset.name}</span>
              {type === "instructor" ? <Button type="button" variant={asset.isPrimary ? "secondary" : "ghost"} size="sm" onClick={() => onChange(project.assets.map((item) => item.type === "instructor" ? { ...item, isPrimary: item.id === asset.id } : item))}>{asset.isPrimary ? "대표" : "대표 지정"}</Button> : null}
              <Button type="button" variant="ghost" size="icon-sm" aria-label="이미지 삭제" onClick={() => onChange(project.assets.filter((item) => item.id !== asset.id))}><Trash2 /></Button>
            </div>
            {type === "reference" ? (
              <div className="mt-3 space-y-2">
                <div className="flex gap-2">
                  <Select value={asset.purpose || "전체 분위기"} onValueChange={(value) => onChange(project.assets.map((item) => item.id === asset.id ? { ...item, purpose: value } : item))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["전체 분위기", "색감", "레이아웃", "타이포그래피", "인물 배치", "혜택 표현", "긴급성 표현"].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select>
                  <Select value={asset.importance || "보통"} onValueChange={(value: "낮음" | "보통" | "높음") => onChange(project.assets.map((item) => item.id === asset.id ? { ...item, importance: value } : item))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["낮음", "보통", "높음"].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select>
                </div>
                <Input value={asset.memo || ""} placeholder="참고할 점 메모" onChange={(event) => onChange(project.assets.map((item) => item.id === asset.id ? { ...item, memo: event.target.value } : item))} />
                <Select value={asset.applyToStrategies?.length === AD_STRATEGIES.length ? "all" : asset.applyToStrategies?.[0] || "all"} onValueChange={(value) => onChange(project.assets.map((item) => item.id === asset.id ? { ...item, applyToStrategies: value === "all" ? [...AD_STRATEGIES] : [value as AdStrategy] } : item))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">5개 전체에 적용</SelectItem>{AD_STRATEGIES.map((strategy) => <SelectItem key={strategy} value={strategy}>{STRATEGY_META[strategy].label}에만 적용</SelectItem>)}</SelectContent></Select>
                <label className="flex items-center gap-2 text-xs"><Checkbox checked={asset.enabled !== false} onCheckedChange={(checked) => onChange(project.assets.map((item) => item.id === asset.id ? { ...item, enabled: checked === true } : item))} /> 분석에 사용</label>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function StyleProfileEditor({ profile, onChange }: { profile: StyleProfile; onChange: (profile: StyleProfile) => void }) {
  const fields: Array<[StyleProfile["enabledFields"][number], string]> = [["color", "색감"], ["layout", "레이아웃"], ["typography", "타이포그래피"], ["person", "인물 배치"], ["benefit", "혜택 표현"]];
  return (
    <Card className="bg-muted/30"><CardHeader><CardTitle>참고 이미지 스타일 분석</CardTitle><CardDescription>{profile.summary}</CardDescription></CardHeader><CardContent className="space-y-3">
      <div className="flex flex-wrap gap-4">{fields.map(([field, label]) => <label key={field} className="flex items-center gap-2 text-sm"><Checkbox checked={profile.enabledFields.includes(field)} onCheckedChange={(checked) => onChange({ ...profile, enabledFields: checked ? [...profile.enabledFields, field] : profile.enabledFields.filter((item) => item !== field) })} /> {label} 반영</label>)}</div>
      <div className="grid gap-3 text-sm md:grid-cols-2"><p><b>레이아웃:</b> {profile.layout}</p><p><b>타이포:</b> {profile.typography}</p><p><b>인물:</b> {profile.personPlacement}</p><p><b>혜택:</b> {profile.benefitExpression}</p></div>
      <div className="flex gap-2">{[...profile.backgroundColors, ...profile.accentColors].slice(0, 8).map((color) => <span key={color} className="size-7 rounded-full border" style={{ backgroundColor: color }} title={color} />)}</div>
      <p className="text-xs text-muted-foreground">복제 제외: {profile.excludedElements.join(", ") || "고유 문구·로고·인물·그래픽"}</p>
    </CardContent></Card>
  );
}

function ProjectForm({ project, step, onStep, onChange, onGenerate, onAnalyze, busy, error }: { project: AdProject; step: number; onStep: (step: number) => void; onChange: (project: AdProject) => void; onGenerate: () => void; onAnalyze: () => void; busy: string; error: string }) {
  const update = <K extends keyof AdProject>(key: K, value: AdProject[K]) => onChange({ ...project, [key]: value, updatedAt: new Date().toISOString() });
  const validation = validateAdProject(project);
  return (
    <div className="space-y-6">
      <div className="grid gap-2 sm:grid-cols-4">{STEPS.map((label, index) => <Button key={label} variant={step === index ? "default" : "outline"} onClick={() => onStep(index)}><span className="grid size-6 place-items-center rounded-full bg-background/15 text-xs">{index + 1}</span>{label}</Button>)}</div>
      {error ? <Alert variant="destructive"><AlertTitle>처리할 수 없습니다</AlertTitle><AlertDescription className="whitespace-pre-line">{error}</AlertDescription></Alert> : null}
      <Card><CardHeader><CardTitle>{STEPS[step]}</CardTitle><CardDescription>{step === 0 ? "강의 일정과 현재 홍보 상태를 입력하세요." : step === 1 ? "실제로 제공하는 특징 5개와 핵심 타깃만 입력하세요." : step === 2 ? "검증 가능한 강사 이력과 선택 사진을 등록하세요." : "혜택과 참고 스타일을 설정하고 생성하세요."}</CardDescription></CardHeader><CardContent className="space-y-5">
        {step === 0 ? <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2"><Label>프로젝트 이름</Label><Input value={project.name} onChange={(event) => update("name", event.target.value)} /></div>
          <div className="space-y-2"><Label>진행 상태 *</Label><Select value={project.progressStatus} onValueChange={(value: AdProject["progressStatus"]) => update("progressStatus", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PROGRESS_STATUSES.map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-2"><Label>강의명 *</Label><Input value={project.lectureName} placeholder="AI 음악으로 수익 만드는 법" onChange={(event) => update("lectureName", event.target.value)} /></div>
          <div className="space-y-2"><Label>강사명 *</Label><Input value={project.instructorName} placeholder="애니한" onChange={(event) => update("instructorName", event.target.value)} /></div>
          <div className="space-y-2"><Label>강의 날짜 *</Label><Input type="date" value={project.lectureDate} onChange={(event) => update("lectureDate", event.target.value)} /></div>
          <div className="space-y-2"><Label>강의 시작 시간 *</Label><Input type="time" value={project.lectureTime} onChange={(event) => update("lectureTime", event.target.value)} /></div>
          <div className="space-y-2"><Label>가격 구분</Label><Select value={project.priceType} onValueChange={(value: AdProject["priceType"]) => update("priceType", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["미정", "무료", "유료"].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-2"><Label>가격</Label><Input value={project.price} disabled={project.priceType !== "유료"} placeholder="299,000" onChange={(event) => update("price", event.target.value)} /></div>
          <div className="space-y-2"><Label>신청 URL</Label><Input type="url" value={project.applicationUrl} placeholder="https://..." onChange={(event) => update("applicationUrl", event.target.value)} /></div>
          <div className="space-y-2"><Label>신청 마감</Label><Input type="datetime-local" value={project.applicationDeadline} onChange={(event) => update("applicationDeadline", event.target.value)} /></div>
        </div> : null}
        {step === 1 ? <div className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2">{project.features.map((feature, index) => <div key={index} className="space-y-2"><Label>특징 {index + 1} *</Label><Input value={feature} placeholder={index === 0 ? "초보자 실습 중심" : "실제로 제공하는 특징"} onChange={(event) => update("features", project.features.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} /></div>)}</div>
          <div className="space-y-2"><Label>핵심 타깃 *</Label><Textarea rows={5} value={project.targetDescription} placeholder="누가, 어떤 상황에서, 무엇을 얻기 위해 들어야 하는지 입력하세요." onChange={(event) => update("targetDescription", event.target.value)} /></div>
        </div> : null}
        {step === 2 ? <div className="grid gap-8 lg:grid-cols-2">
          <ArrayFields label="강사 이력" values={project.instructorHistories} minimum={1} reorder onChange={(value) => update("instructorHistories", value)} />
          <AssetUploader project={project} type="instructor" title="강사 사진" maximum={5} onChange={(value) => update("assets", value)} />
        </div> : null}
        {step === 3 ? <div className="space-y-7">
          <div className="grid gap-6 lg:grid-cols-2"><ArrayFields label="신청 혜택" values={project.benefits} onChange={(value) => update("benefits", value)} /><div className="space-y-4"><div className="space-y-2"><Label>원하는 분위기</Label><Select value={project.mood} onValueChange={(value: AdProject["mood"]) => update("mood", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["강렬함", "프리미엄", "친근함", "신뢰감"].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>현재 참여 인원</Label><Input type="number" min="0" value={project.participantCount} placeholder="실제 숫자가 있을 때만 입력" onChange={(event) => update("participantCount", event.target.value)} /></div><div className="space-y-2"><Label>반드시 넣을 문구</Label><Input value={project.mandatoryCopy} onChange={(event) => update("mandatoryCopy", event.target.value)} /></div><div className="space-y-2"><Label>사용 금지 문구</Label><Input value={project.prohibitedCopy} onChange={(event) => update("prohibitedCopy", event.target.value)} /></div></div></div>
          <AssetUploader project={project} type="reference" title="참고 광고 이미지" maximum={10} onChange={(value) => update("assets", value)} />
          <div className="grid gap-6 lg:grid-cols-3">
            <AssetUploader project={project} type="book" title="책·전자책 표지" maximum={5} onChange={(value) => update("assets", value)} />
            <AssetUploader project={project} type="gift" title="증정품 이미지" maximum={5} onChange={(value) => update("assets", value)} />
            <AssetUploader project={project} type="logo" title="브랜드 로고" maximum={1} onChange={(value) => update("assets", value)} />
          </div>
          <div className="flex justify-end"><Button variant="outline" disabled={busy !== "" || !project.assets.some((asset) => asset.type === "reference" && asset.enabled !== false)} onClick={onAnalyze}>{busy === "analyze" ? <Loader2 className="animate-spin" /> : <Sparkles />} 참고 이미지 분석</Button></div>
          {project.styleProfile ? <StyleProfileEditor profile={project.styleProfile} onChange={(value) => update("styleProfile", value)} /> : null}
        </div> : null}
      </CardContent></Card>
      <div className="flex items-center justify-between"><Button variant="outline" disabled={step === 0} onClick={() => onStep(Math.max(0, step - 1))}>이전</Button>{step < 3 ? <Button onClick={() => onStep(Math.min(3, step + 1))}>다음</Button> : <Button size="lg" disabled={busy !== "" || !validation.success} onClick={onGenerate}>{busy === "generate" ? <Loader2 className="animate-spin" /> : <Sparkles />} 홍보소재 프롬프트 5개 만들기</Button>}</div>
      {!validation.success && step === 3 ? <p className="text-right text-sm text-muted-foreground">{validation.error.issues[0]?.message}</p> : null}
    </div>
  );
}

function CopyButton({ text }: { text: string }) { const [copied, setCopied] = useState(false); return <Button variant="ghost" size="sm" onClick={() => { void navigator.clipboard.writeText(text); setCopied(true); window.setTimeout(() => setCopied(false), 1200); }}>{copied ? <Check /> : <Clipboard />}{copied ? "복사됨" : "복사"}</Button>; }

function PromptCard({ material, onRegenerate, busy }: { material: AdMaterial; onRegenerate: () => void; busy: boolean }) {
  const fullPrompt = `[제목 설계]\n${material.titleDesign}\n\n[본문 설계]\n${material.bodyDesign}\n\n[이미지 생성 프롬프트]\n${material.imagePrompt}\n\n[Negative prompt]\n${material.negativePrompt}`;
  return <Card>
    <CardHeader>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><Badge>{STRATEGY_META[material.strategy].label}</Badge><CardDescription className="mt-2">{STRATEGY_META[material.strategy].description}</CardDescription></div>
        <Badge variant="outline">{material.outputSize} · {material.aspectRatio}</Badge>
      </div>
      <CardTitle className="pt-2 text-xl">{material.mainHook}</CardTitle>
    </CardHeader>
    <CardContent className="space-y-4">
      <div><p className="mb-2 text-sm font-semibold">적용 심리 기법</p><div className="flex flex-wrap gap-2">{material.psychologyTechniques.map((technique) => <Badge key={technique.code} variant="secondary" title={technique.application}>{technique.code} · {technique.name}</Badge>)}</div></div>
      <div className="grid gap-3 md:grid-cols-2"><div className="rounded-lg border p-4"><p className="mb-2 text-sm font-semibold">PDF 제목 설계</p><p className="text-sm leading-6 text-muted-foreground whitespace-pre-wrap">{material.titleDesign}</p></div><div className="rounded-lg border p-4"><p className="mb-2 text-sm font-semibold">PDF 본문 설계</p><p className="text-sm leading-6 text-muted-foreground whitespace-pre-wrap">{material.bodyDesign}</p></div></div>
      <div><p className="mb-2 text-sm font-semibold">이미지 생성 프롬프트</p><div className="max-h-80 overflow-y-auto rounded-lg border bg-muted/40 p-4 text-sm leading-6 whitespace-pre-wrap">{material.imagePrompt}</div></div>
      <div><p className="mb-2 text-sm font-semibold">Negative prompt</p><div className="rounded-lg border bg-muted/25 p-3 text-sm leading-6 text-muted-foreground whitespace-pre-wrap">{material.negativePrompt}</div></div>
      <div className="flex flex-wrap justify-end gap-2"><CopyButton text={fullPrompt} /><Button variant="outline" disabled={busy} onClick={onRegenerate}>{busy ? <Loader2 className="animate-spin" /> : <RefreshCw />} 이 전략 프롬프트 다시 생성</Button></div>
    </CardContent>
  </Card>;
}

export function KakaoAdMaker() {
  const [projects, setProjects] = useState<AdProject[]>([]);
  const [activeId, setActiveId] = useState("");
  const [screen, setScreen] = useState<"dashboard" | "input" | "result">("dashboard");
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState("");
  const [generationStage, setGenerationStage] = useState(0);
  const [error, setError] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const active = projects.find((project) => project.id === activeId);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const storedProjects = JSON.parse(saved) as AdProject[];
          setProjects(storedProjects.map((project) => ({
            ...project,
            materials: project.materials.filter((material) => Boolean(material.imagePrompt && material.psychologyTechniques?.length)),
          })).toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
        }
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      } finally {
        setHydrated(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => { if (!hydrated) return; const timer = window.setTimeout(() => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(projects)); } catch { setError("브라우저 저장 공간이 부족합니다. 참고 이미지를 줄여 주세요."); } }, 2000); return () => window.clearTimeout(timer); }, [projects, hydrated]);
  const updateActive = (project: AdProject) => setProjects((items) => [project, ...items.filter((item) => item.id !== project.id)]);

  async function request(path: string, strategy?: AdMaterial["strategy"]) {
    if (!active) return null;
    setBusy(path.includes("analyze") ? "analyze" : "generate"); setError("");
    const project = path.includes("generate")
      ? { ...active, assets: active.assets.map((asset) => ({ ...asset, dataUrl: "" })) }
      : { ...active, assets: active.assets.filter((asset) => asset.type === "reference") };
    const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ project, strategy }) });
    const body = await response.json() as { error?: string; styleProfile?: StyleProfile; materials?: AdMaterial[]; model?: string; promptVersion?: string };
    if (!response.ok) throw new Error(body.error || "요청을 처리하지 못했습니다.");
    return body;
  }
  async function analyze() { try { const body = await request("/api/kakao-ad-maker/analyze"); if (body?.styleProfile && active) updateActive({ ...active, styleProfile: body.styleProfile, updatedAt: new Date().toISOString() }); } catch (cause) { setError(cause instanceof Error ? cause.message : "분석에 실패했습니다."); } finally { setBusy(""); } }
  async function generate(strategy?: AdMaterial["strategy"]) { let interval = 0; try { setGenerationStage(1); interval = window.setInterval(() => setGenerationStage((value) => Math.min(value + 1, 3)), 1400); const body = await request("/api/kakao-ad-maker/generate", strategy); if (body?.materials && active) { const materials = strategy ? active.materials.map((material) => material.strategy === strategy ? { ...body.materials![0], id: material.id } : material) : body.materials; const updated = { ...active, materials, copyModel: body.model || "", promptVersion: body.promptVersion || "", updatedAt: new Date().toISOString() }; updateActive(updated); setGenerationStage(4); window.setTimeout(() => setScreen("result"), 500); } } catch (cause) { setError(cause instanceof Error ? cause.message : "생성에 실패했습니다."); setGenerationStage(0); } finally { window.clearInterval(interval); setBusy(""); } }

  if (!hydrated) return <Card><CardContent className="flex min-h-72 items-center justify-center"><Loader2 className="animate-spin" /> 프로젝트 불러오는 중...</CardContent></Card>;
  if (!active || screen === "dashboard") return <ProjectDashboard projects={projects} onNew={() => { const project = createEmptyAdProject(); setProjects((items) => [project, ...items]); setActiveId(project.id); setStep(0); setScreen("input"); }} onOpen={(project) => { setActiveId(project.id); setScreen(project.materials.length ? "result" : "input"); }} onDuplicate={(project) => { const now = new Date().toISOString(); const duplicated = { ...project, id: crypto.randomUUID(), name: `${project.name} 사본`, materials: project.materials.map((material) => ({ ...material, id: crypto.randomUUID() })), createdAt: now, updatedAt: now }; setProjects((items) => [duplicated, ...items]); }} onDelete={(project) => { if (window.confirm(`'${project.name}' 프로젝트를 삭제할까요?`)) setProjects((items) => items.filter((item) => item.id !== project.id)); }} />;

  return <div className="space-y-6">
    <div className="flex flex-wrap items-center gap-3"><Button variant="ghost" onClick={() => setScreen("dashboard")}><ArrowLeft /> 프로젝트</Button><Input className="max-w-sm text-lg font-semibold" value={active.name} aria-label="프로젝트 이름" onChange={(event) => updateActive({ ...active, name: event.target.value, updatedAt: new Date().toISOString() })} /><Badge variant="secondary"><Save /> 2초 자동 저장</Badge>{active.materials.length ? <div className="ml-auto flex gap-2"><Button variant={screen === "input" ? "secondary" : "outline"} onClick={() => setScreen("input")}>정보 수정</Button><Button variant={screen === "result" ? "secondary" : "outline"} onClick={() => setScreen("result")}>결과 5개</Button></div> : null}</div>
    {generationStage > 0 && busy === "generate" ? <Dialog open><DialogContent showCloseButton={false}><DialogHeader><DialogTitle>홍보소재 프롬프트를 만들고 있습니다</DialogTitle><DialogDescription>입력한 사실만 사용해 설득 전략을 구성합니다.</DialogDescription></DialogHeader><div className="space-y-3">{["전략 분석", "핵심 카피 구성", "이미지 생성 프롬프트 작성", "결과 검증"].map((label, index) => <div key={label} className="flex items-center gap-3 rounded-lg border p-3">{generationStage > index + 1 ? <Check className="text-primary" /> : generationStage === index + 1 ? <Loader2 className="animate-spin" /> : <span className="size-5 rounded-full border" />}<span>{label}</span></div>)}</div></DialogContent></Dialog> : null}
    {screen === "input" ? <ProjectForm project={active} step={step} onStep={setStep} onChange={updateActive} onGenerate={() => void generate()} onAnalyze={() => void analyze()} busy={busy} error={error} /> : null}
    {screen === "result" && active.materials.length ? <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4"><div><h2 className="text-2xl font-semibold">5개 전략 프롬프트</h2><p className="mt-1 text-sm text-muted-foreground">OpenAI가 1600×900 가로형 홍보소재를 만들 수 있도록 전략·문구·레이아웃·인물 지시를 하나의 프롬프트로 정리했습니다.</p></div><Button variant="outline" disabled={busy !== ""} onClick={() => void generate()}><RefreshCw /> 5개 전체 다시 생성</Button></div>
      {error ? <Alert variant="destructive"><AlertTitle>처리할 수 없습니다</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
      <div className="grid gap-5 xl:grid-cols-2">{active.materials.map((material) => <PromptCard key={material.id} material={material} busy={busy !== ""} onRegenerate={() => void generate(material.strategy)} />)}</div>
      <p className="text-xs text-muted-foreground">생성 모델 {active.copyModel || "-"} · 프롬프트 {active.promptVersion || "-"}</p>
    </div> : null}
  </div>;
}
