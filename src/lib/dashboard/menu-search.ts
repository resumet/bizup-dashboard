export type DashboardMenuSearchItem = {
  label: string;
  href: string;
  group: string;
  keywords?: readonly string[];
};

export type DashboardMenuCustomKeywords = Record<string, string[]>;

export type DashboardCourseSearchItem = {
  id: string;
  name: string;
  instructor: string;
  cohort: string;
  webinarDate: string;
};

export const DASHBOARD_MENU_SEARCH_ITEMS: readonly DashboardMenuSearchItem[] = [
  { label: "진행중 강의 보기", href: "/services/course-operations", group: "강의 운영", keywords: ["강의 운영 자동화", "강의"] },
  { label: "강사 인스타그램 관리", href: "/services/instagram-management", group: "강의 운영", keywords: ["콘텐츠 관리", "컨텐츠 관리", "인스타그램"] },
  { label: "강사 출연 유튜브 관리", href: "/services/youtube-management", group: "강의 운영", keywords: ["유튜브 출연 관리", "콘텐츠 관리", "컨텐츠 관리", "유튜브"] },
  { label: "강의별 해야할일", href: "/services/course-wbs", group: "강의 운영", keywords: ["강의 WBS", "할 일", "해야 할 일"] },
  { label: "강사 정보 받기", href: "/services/instructor-intakes", group: "강의 운영" },
  { label: "근태관리/업무일지/비품신청", href: "/services/work-management", group: "기타", keywords: ["업무 관리", "업무관리"] },
  { label: "강의 일정 플래너", href: "/services/course-schedule-planner", group: "근태관리/업무일지/비품신청" },
  { label: "수강생 및 메시지 관리", href: "/services/student-management", group: "명단 · 메시지", keywords: ["수강생 관리", "명단", "메시지"] },
  { label: "유용한 도구들", href: "/services/tools", group: "기타", keywords: ["도구", "업무 도구", "유틸리티"] },
  { label: "수강생 관리 및 정산", href: "/services/course-operations/students-settlements", group: "수강생 및 메시지 관리" },
  { label: "웨비나진행 결과관리", href: "/services/course-webinars", group: "강의 운영", keywords: ["라이브 웨비나", "웨비나 대시보드"] },
  { label: "유튜브 채널 관리", href: "/services/youtube-channels", group: "유용한 도구들" },
  { label: "성과기록", href: "/services/performance-records", group: "퍼포먼스 광고", keywords: ["광고 성과", "광고성과", "성과 재무"] },
  { label: "내부광고 성과기록", href: "/services/ad-performance", group: "성과기록", keywords: ["광고성과", "성과 재무"] },
  { label: "외부광고 성과기록", href: "/services/external-marketing", group: "성과기록", keywords: ["외부마케팅", "외부 마케팅", "외부 마케팅 대행"] },
  { label: "입출금 장부", href: "/services/cash-ledger", group: "관리자" },
  { label: "수강생 명단 분석", href: "/services/course-roster", group: "수강생 및 메시지 관리" },
  { label: "주소록 매니저", href: "/services/address-books", group: "수강생 및 메시지 관리" },
  { label: "전화 세일즈 명단", href: "/services/phone-sales-list", group: "수강생 및 메시지 관리" },
  { label: "알림톡 · 문자 자동화", href: "/services/message-automation", group: "수강생 및 메시지 관리" },
  { label: "업무일지", href: "/hr", group: "근태관리/업무일지/비품신청", keywords: ["팀 업무", "팀업무"] },
  { label: "근태관리", href: "/hr/leave", group: "근태관리/업무일지/비품신청", keywords: ["근태 관리"] },
  { label: "비품신청", href: "/hr/supplies", group: "근태관리/업무일지/비품신청", keywords: ["비품 신청"] },
  { label: "출장보고서", href: "/services/business-trip-reports", group: "근태관리/업무일지/비품신청", keywords: ["출장 보고", "출장비", "출장 비용"] },
  { label: "공용 캘린더", href: "/calendar", group: "근태관리/업무일지/비품신청" },
  { label: "수강생 명단 중복 검사", href: "/services/roster-duplicates", group: "유용한 도구들" },
  { label: "결제자 · 수강생 비교", href: "/services/roster-comparison", group: "유용한 도구들" },
  { label: "강의 정산 계산기", href: "/tools/settlement-calculator", group: "유용한 도구들" },
  { label: "연락처 CSV 추출", href: "/services/contact-csv", group: "유용한 도구들" },
  { label: "유튜브 영상 다운로드", href: "/services/youtube-download", group: "유용한 도구들" },
  { label: "유튜브 라이브 레코더", href: "/services/tools", group: "유용한 도구들", keywords: ["웨비나 녹화", "라이브 녹화", "레코더 다운로드"] },
  { label: "카카오톡 태그 자동 관리자", href: "/services/tools", group: "유용한 도구들", keywords: ["카카오 오픈톡", "카카오 오픈채팅", "태그 관리"] },
  { label: "노바 정산서 검증", href: "/services/nova-settlement-validator", group: "유용한 도구들" },
  { label: "영상 대본 추출", href: "/extras", group: "유용한 도구들", keywords: ["부가 기능", "부가기능", "대본"] },
];

export function normalizeDashboardSearchText(value: string) {
  return value.normalize("NFKC").replace(/\s+/gu, "").toLocaleLowerCase("ko-KR");
}

export function filterDashboardMenus(
  query: string,
  customKeywords: DashboardMenuCustomKeywords = {},
) {
  const normalizedQuery = normalizeDashboardSearchText(query);
  if (!normalizedQuery) return DASHBOARD_MENU_SEARCH_ITEMS.slice(0, 6);
  return DASHBOARD_MENU_SEARCH_ITEMS.filter((item) =>
    [item.label, item.group, ...(item.keywords ?? []), ...(customKeywords[item.href] ?? [])]
      .some((value) => normalizeDashboardSearchText(value).includes(normalizedQuery)),
  );
}

export function filterDashboardCourses(courses: readonly DashboardCourseSearchItem[], query: string) {
  const normalizedQuery = normalizeDashboardSearchText(query);
  if (!normalizedQuery) return [];
  return courses.filter((course) =>
    normalizeDashboardSearchText(course.instructor).includes(normalizedQuery)
    || normalizeDashboardSearchText(course.name).includes(normalizedQuery),
  );
}
