import { z } from "zod";

import {
  DASHBOARD_MENU_SEARCH_ITEMS,
  normalizeDashboardSearchText,
  type DashboardMenuCustomKeywords,
} from "./menu-search";

const MAX_KEYWORDS_PER_MENU = 12;
const MENU_ROUTES = new Set(DASHBOARD_MENU_SEARCH_ITEMS.map((item) => item.href));

const keywordListSchema = z
  .array(z.string().trim().min(1, "검색어를 입력해 주세요.").max(40, "검색어는 40자 이하로 입력해 주세요."))
  .max(MAX_KEYWORDS_PER_MENU, `메뉴별 검색어는 최대 ${MAX_KEYWORDS_PER_MENU}개까지 입력할 수 있습니다.`);

export const dashboardMenuSearchKeywordSettingsSchema = z
  .object({
    keywords: z.record(z.string(), keywordListSchema),
  })
  .superRefine((settings, context) => {
    for (const route of Object.keys(settings.keywords)) {
      if (!MENU_ROUTES.has(route)) {
        context.addIssue({
          code: "custom",
          path: ["keywords", route],
          message: "등록되지 않은 메뉴의 검색어는 저장할 수 없습니다.",
        });
      }
    }
  });

export type DashboardMenuSearchKeywordSettings = z.infer<typeof dashboardMenuSearchKeywordSettingsSchema>;

function cleanKeywords(values: readonly string[]) {
  const unique = new Map<string, string>();
  for (const value of values) {
    const trimmed = value.trim().replace(/\s+/gu, " ");
    const normalized = normalizeDashboardSearchText(trimmed);
    if (normalized && !unique.has(normalized)) unique.set(normalized, trimmed);
  }
  return [...unique.values()];
}

export function normalizeDashboardMenuSearchKeywordSettings(
  input: DashboardMenuSearchKeywordSettings,
): DashboardMenuSearchKeywordSettings {
  const parsed = dashboardMenuSearchKeywordSettingsSchema.parse(input);
  const keywords: DashboardMenuCustomKeywords = {};

  for (const item of DASHBOARD_MENU_SEARCH_ITEMS) {
    const values = cleanKeywords(parsed.keywords[item.href] ?? []);
    if (values.length) keywords[item.href] = values;
  }

  return dashboardMenuSearchKeywordSettingsSchema.parse({ keywords });
}

export function createDashboardMenuSearchKeywordSettings(
  drafts: Readonly<Record<string, string>>,
) {
  const keywords: DashboardMenuCustomKeywords = {};
  for (const item of DASHBOARD_MENU_SEARCH_ITEMS) {
    const values = cleanKeywords((drafts[item.href] ?? "").split(/[,，\n]/u));
    if (values.length) keywords[item.href] = values;
  }
  return normalizeDashboardMenuSearchKeywordSettings({ keywords });
}
