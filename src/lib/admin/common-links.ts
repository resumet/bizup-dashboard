import { z } from "zod";

export const commonLinksSchema = z.array(z.object({
  label: z.string().trim().min(1, "링크 이름을 입력해 주세요.").max(80, "링크 이름은 80자 이하여야 합니다."),
  url: z.string().trim().max(2048).url("올바른 링크 주소를 입력해 주세요.").refine(value => {
    try {
      const url = new URL(value);
      return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password;
    } catch { return false; }
  }, "http:// 또는 https:// 주소를 입력해 주세요."),
})).max(50, "공통 링크는 최대 50개까지 등록할 수 있습니다.");

export type CommonLink = z.infer<typeof commonLinksSchema>[number];
export const DEFAULT_COMMON_LINKS: CommonLink[] = [
  { label: "무료강의멘트", url: "https://docs.google.com/spreadsheets/d/1uVAgx23JXDqxl5uAjgpGywDyg9F7vZ74wJcsAC1p14c/edit?gid=1923105310#gid=1923105310" },
  { label: "지령창", url: "https://docs.google.com/presentation/d/1glOkbnWTgXufnnUNpcoDIvityzc8EHTyQghgzqpFIKM/edit?usp=sharing" },
  { label: "카카오플친 문의", url: "https://pf.kakao.com/_xomzxgn/chat" },
];
