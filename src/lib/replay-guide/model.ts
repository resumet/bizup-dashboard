import { z } from "zod";
import { webLink } from "@/lib/post-sales/model";

const optionalUrl = z.string().trim().max(2048).refine(value => !value || Boolean(webLink(value)), "http 또는 https 주소를 입력해 주세요.");
export const guideSchema = z.object({
  title: z.string().trim().max(200),
  sections: z.array(z.object({
    id: z.string().min(1).max(80),
    heading: z.string().trim().max(200),
    body: z.string().trim().max(8000),
    note: z.string().trim().max(3000),
    link: optionalUrl,
    images: z.array(z.string().url().max(2048).refine(url => Boolean(webLink(url)))).max(8),
  })).min(1).max(20),
}).refine(guide => new Set(guide.sections.map(section => section.id)).size === guide.sections.length);
export type ReplayGuide = z.infer<typeof guideSchema>;

export function initialGuide(courseName: string): ReplayGuide {
  const steps = [
    ["비즈업클래스에 접속하기", "수강 신청에 사용한 카카오 계정으로 로그인해 주세요."],
    ["마이페이지 열기", "화면 오른쪽 위의 마이페이지를 선택해 주세요."],
    ["내 강의실에서 수강하기", `수강 중인 강의에서 ‘${courseName}’의 수강하기 버튼을 눌러 주세요.`],
    ["강의 챕터 선택하기", "재생창의 강의목차 탭을 열고 다시 볼 회차를 선택해 주세요."],
    ["강의자료 내려받기", "먼저 원하는 회차를 선택한 뒤 강의자료 탭에서 해당 회차의 자료를 내려받아 주세요."],
    ["재생 화면 사용법", "재생 화면을 한 번 누르면 음량과 전체 화면 버튼이 나타납니다."],
    ["자주 묻는 질문", "강의목차와 자료 탭이 보이지 않아요.\n화면을 아래로 스크롤하거나 브라우저의 화면 배율을 줄여 주세요."],
  ];
  return { title: `${courseName} 다시보기 안내문`, sections: steps.map(([heading, body], i) => ({
    id: `step-${i + 1}`, heading, body, note: "", link: i === 0 ? "https://www.bizupclass.com/" : "", images: [],
  })) };
}

export const replayPath = (token: string) => `/public/replay-guide/${token}`;
export type GuideState = { revision: number; path: string; enabled: boolean; shortUrl: string };
