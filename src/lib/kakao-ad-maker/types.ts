export const AD_STRATEGIES = [
  "problem",
  "benefit",
  "authority",
  "gift",
  "urgency",
] as const;

export type AdStrategy = (typeof AD_STRATEGIES)[number];

export const PROGRESS_STATUSES = [
  "모집 중",
  "하루 전",
  "당일 예정",
  "잠시 후 시작",
  "지금 진행 중",
  "마감 임박",
  "종료",
] as const;

export type ProgressStatus = (typeof PROGRESS_STATUSES)[number];
export type AdMood = "강렬함" | "프리미엄" | "친근함" | "신뢰감";
export type AssetType = "instructor" | "book" | "gift" | "logo" | "reference";

export type AdAsset = {
  id: string;
  type: AssetType;
  name: string;
  mimeType: string;
  dataUrl: string;
  isPrimary: boolean;
  purpose?: string;
  importance?: "낮음" | "보통" | "높음";
  memo?: string;
  enabled?: boolean;
  applyToStrategies?: AdStrategy[];
};

export type StyleProfile = {
  inputHash: string;
  summary: string;
  backgroundColors: string[];
  accentColors: string[];
  layout: string;
  typography: string;
  personPlacement: string;
  benefitExpression: string;
  excludedElements: string[];
  enabledFields: Array<"color" | "layout" | "typography" | "person" | "benefit">;
  model?: string;
  analyzedAt?: string;
};

export type AdMaterial = {
  id: string;
  strategy: AdStrategy;
  mainHook: string;
  subCopy: string;
  selectedFeatures: string[];
  instructorProof: string[];
  statusBadge: string;
  cta: string;
  psychologyTechniques: Array<{ code: string; name: string; application: string }>;
  titleDesign: string;
  bodyDesign: string;
  visualDirection: string;
  imagePrompt: string;
  negativePrompt: string;
  aspectRatio: "16:9";
  outputSize: "1600x900";
  riskFlags: string[];
};

export type AdProject = {
  id: string;
  name: string;
  lectureName: string;
  instructorName: string;
  lectureDate: string;
  lectureTime: string;
  progressStatus: ProgressStatus;
  features: string[];
  targetDescription: string;
  instructorHistories: string[];
  priceType: "무료" | "유료" | "미정";
  price: string;
  benefits: string[];
  applicationDeadline: string;
  participantCount: string;
  applicationUrl: string;
  mood: AdMood;
  mandatoryCopy: string;
  prohibitedCopy: string;
  assets: AdAsset[];
  styleProfile: StyleProfile | null;
  materials: AdMaterial[];
  copyModel: string;
  promptVersion: string;
  createdAt: string;
  updatedAt: string;
};

export const STRATEGY_META: Record<AdStrategy, { label: string; description: string }> = {
  problem: { label: "문제·불안 자극형", description: "타깃의 문제를 질문하고 해결책으로 연결" },
  benefit: { label: "핵심 혜택·결과형", description: "가장 강한 변화와 결과를 시각적으로 강조" },
  authority: { label: "강사 신뢰·권위형", description: "강사의 실제 이력과 전문성을 중심으로 설득" },
  gift: { label: "혜택·증정형", description: "혜택이 없으면 강의 참여로 얻는 결과를 강조" },
  urgency: { label: "긴급성·라이브형", description: "현재 진행 상태와 즉시 행동을 가장 강하게 반영" },
};

export function createEmptyAdProject(): AdProject {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name: "새 홍보소재",
    lectureName: "",
    instructorName: "",
    lectureDate: "",
    lectureTime: "19:30",
    progressStatus: "모집 중",
    features: ["", "", "", "", ""],
    targetDescription: "",
    instructorHistories: [""],
    priceType: "미정",
    price: "",
    benefits: [],
    applicationDeadline: "",
    participantCount: "",
    applicationUrl: "",
    mood: "신뢰감",
    mandatoryCopy: "",
    prohibitedCopy: "",
    assets: [],
    styleProfile: null,
    materials: [],
    copyModel: "",
    promptVersion: "",
    createdAt: now,
    updatedAt: now,
  };
}
