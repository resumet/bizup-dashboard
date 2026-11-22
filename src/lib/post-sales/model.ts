import { z } from "zod";

export const cardIssuers = ["신한", "현대", "삼성", "롯데", "하나", "국민", "비씨", "농협", "우리", "수협", "광주", "전북"] as const;
const shortTerm = new Set<string>(["비씨", "우리", "수협", "광주"]);
const defaultConcernQuestions = [
  "팔로워 0명인 내가 고객의 계정을 운영할 수 있을까요?",
  "촬영도 편집도 자신 없는데 서비스를 팔아도 될까요?",
  "첫 고객은 어디서, 어떻게 찾아야 할까요?",
  "고객에게 무엇을 제안하고 얼마를 받아야 할까요?",
];

export function webLink(value: string) {
  try {
    const url = new URL(value);
    return /^https?:$/.test(url.protocol) && !url.username && !url.password ? url.href : "";
  } catch { return ""; }
}

export function youtubeId(value: string) {
  if (!webLink(value)) return "";
  const url = new URL(value);
  const host = url.hostname.replace(/^(www\.|m\.)/, "");
  const id = host === "youtu.be" ? url.pathname.slice(1)
    : host === "youtube.com" ? url.searchParams.get("v") ?? /^\/(?:live|shorts|embed)\/([^/]+)/.exec(url.pathname)?.[1] : "";
  return id && /^[\w-]{11}$/.test(id) ? id : "";
}

export function driveResource(value: string) {
  if (!webLink(value)) return null;
  const url = new URL(value);
  if (url.protocol !== "https:" || url.port) return null;
  if (url.hostname === "docs.google.com") {
    const doc = /^\/(document|spreadsheets|presentation)\/(?:u\/\d+\/)?d\/([\w-]{8,200})(?:\/|$)/.exec(url.pathname);
    if (!doc) return null;
    const target = new URL(`https://docs.google.com/${doc[1]}/d/${doc[2]}/edit`);
    const key = url.searchParams.get("resourcekey");
    if (key) target.searchParams.set("resourcekey", key);
    target.searchParams.set("hl", "en");
    return target;
  }
  if (url.hostname !== "drive.google.com") return null;
  const folder = /^\/drive\/(?:u\/\d+\/)?folders\/([\w-]+)\/?$/.exec(url.pathname);
  const file = /^\/file\/d\/([\w-]+)(?:\/view|\/preview)?\/?$/.exec(url.pathname);
  const id = folder?.[1] ?? file?.[1] ?? (url.pathname === "/open" ? url.searchParams.get("id") : null);
  if (!id || !/^[\w-]{8,200}$/.test(id)) return null;
  const target = new URL(folder ? `https://drive.google.com/drive/folders/${id}` : file ? `https://drive.google.com/file/d/${id}/view` : "https://drive.google.com/open");
  if (!folder && !file) target.searchParams.set("id", id);
  const key = url.searchParams.get("resourcekey");
  if (key) target.searchParams.set("resourcekey", key);
  target.searchParams.set("hl", "en");
  return target;
}

const urlField = z.string().trim().max(2048);
const months = z.number().int().min(0).max(120);
export function removeBoldMarkers(text: string) {
  return text.replaceAll("**", "");
}

type SalesCopy = Record<"title" | "intro" | "recap" | "gifts" | "invitation", string> & {
  concernQuestions?: string[]; concernExplanation?: string;
};

export function cleanSalesCopy<T extends SalesCopy>(copy: T) {
  return { ...copy, title: removeBoldMarkers(copy.title), intro: removeBoldMarkers(copy.intro),
    recap: removeBoldMarkers(copy.recap), gifts: removeBoldMarkers(copy.gifts), invitation: removeBoldMarkers(copy.invitation),
    concernQuestions: (copy.concernQuestions ?? []).map(removeBoldMarkers), concernExplanation: removeBoldMarkers(copy.concernExplanation ?? "") };
}

export const pageBackgrounds = {
  white: { label: "흰색", color: "#ffffff" },
  cream: { label: "크림", color: "#fff8e8" },
  mint: { label: "민트", color: "#edf9f3" },
  blue: { label: "하늘", color: "#eff6ff" },
  lavender: { label: "라벤더", color: "#f5f1ff" },
  pink: { label: "연분홍", color: "#fff1f4" },
} as const;

export const defaultSalesColors = { titleBackgroundColor: "#f0fdfa", buttonColor: "#115e59" } as const;
const hexColor = z.string().regex(/^#[0-9a-f]{6}$/i, "올바른 색상을 선택해 주세요.");

export const draftSchema = z.object({
  titleBackgroundColor: hexColor.default(defaultSalesColors.titleBackgroundColor),
  buttonColor: hexColor.default(defaultSalesColors.buttonColor),
  background: z.enum(Object.keys(pageBackgrounds) as (keyof typeof pageBackgrounds)[]).default("white"),
  title: z.string().trim().max(180), intro: z.string().max(5000), recap: z.string().max(15000),
  concernQuestions: z.array(z.string().max(500)).length(4).default(() => [...defaultConcernQuestions]),
  concernExplanation: z.string().max(8000).default(""),
  gifts: z.string().max(6000), invitation: z.string().max(8000),
  chatUrl: urlField.refine(v => !v || !!webLink(v), "무료 단톡방 주소를 확인해 주세요."),
  videoId: z.union([z.uuid(), z.literal("")]),
  giftUrl: urlField.refine(v => !v || !!driveResource(v), "Google 드라이브 파일 또는 폴더의 공유 링크를 입력해 주세요."),
  replayUrl: urlField.refine(v => !v || !!youtubeId(v), "다시보기는 유튜브 영상 또는 라이브 주소를 입력해 주세요."),
  cards: z.array(z.object({ issuer: z.enum(cardIssuers), interestFree: months, installment: months }))
    .length(cardIssuers.length).refine(rows => rows.every((row, i) => row.issuer === cardIssuers[i] && row.interestFree <= row.installment), "카드별 무이자 개월 수와 최대 할부 개월 수를 확인해 주세요."),
}).transform(cleanSalesCopy);
export type SalesDraft = z.infer<typeof draftSchema>;
export type VideoOption = { id: string; label: string; url: string };
export type SalesPage = Omit<SalesDraft, "videoId"> & { instructor: string; courseName: string; paymentUrl: string; videoUrl: string };

export function newDraft(courseName: string, chatUrl: string, replayUrl: string): SalesDraft {
  return { title: courseName, background: "white", ...defaultSalesColors, intro: "", recap: "", gifts: "", invitation: "", chatUrl, giftUrl: "", replayUrl: youtubeId(replayUrl) ? replayUrl : "", videoId: "",
    concernQuestions: [...defaultConcernQuestions], concernExplanation: "",
    cards: cardIssuers.map(issuer => ({ issuer, interestFree: issuer === "전북" ? 3 : shortTerm.has(issuer) ? 5 : 12, installment: issuer === "현대" ? 24 : 12 })) };
}

export function salesSnapshot(draft: SalesDraft, course: { name: string; instructor_name: string; payment_link: string }, videos: VideoOption[]): SalesPage {
  const { videoId, ...content } = draft;
  return { ...content, instructor: course.instructor_name, courseName: course.name, paymentUrl: (course.payment_link || "").trim(), videoUrl: videos.find(video => video.id === videoId)?.url ?? "" };
}
