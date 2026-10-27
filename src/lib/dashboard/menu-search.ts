export type DashboardMenuSearchItem = {
  label: string;
  href: string;
  group: string;
  keywords?: readonly string[];
};

export type DashboardCourseSearchItem = {
  id: string;
  name: string;
  instructor: string;
  cohort: string;
  webinarDate: string;
};

export const DASHBOARD_MENU_SEARCH_ITEMS: readonly DashboardMenuSearchItem[] = [
  { label: "진행중 강의 보기", href: "/services/course-operations", group: "강의 운영", keywords: ["강의 운영 자동화", "강의"] },
  { label: "강사 인스타그램 / 유튜브 관리", href: "/services/content-management", group: "강의 운영", keywords: ["콘텐츠 관리", "컨텐츠 관리", "인스타그램", "유튜브"] },
  { label: "강의별 해야할일", href: "/services/course-wbs", group: "강의 운영", keywords: ["강의 WBS", "할 일", "해야 할 일"] },
  { label: "강사 정보 받기", href: "/services/instructor-intakes", group: "강의 운영" },
  { label: "강의 일정 플래너", href: "/services/course-schedule-planner", group: "강의 운영" },
  { label: "수강생 관리 및 정산", href: "/services/course-operations/students-settlements", group: "강의 운영" },
  { label: "라이브 웨비나", href: "/services/course-webinars", group: "강의 운영" },
  { label: "유튜브 채널 관리", href: "/services/youtube-channels", group: "강의 운영" },
  { label: "광고성과", href: "/services/ad-performance", group: "성과 · 재무" },
  { label: "입출금 장부", href: "/services/cash-ledger", group: "성과 · 재무" },
  { label: "수강생 명단 분석", href: "/services/course-roster", group: "명단 · 메시지" },
  { label: "주소록 매니저", href: "/services/address-books", group: "명단 · 메시지" },
  { label: "전화 세일즈 명단", href: "/services/phone-sales-list", group: "명단 · 메시지" },
  { label: "알림톡 · 문자 자동화", href: "/services/message-automation", group: "명단 · 메시지" },
  { label: "팀 업무", href: "/hr", group: "업무 관리" },
  { label: "근태 관리", href: "/hr/leave", group: "업무 관리" },
  { label: "비품 신청", href: "/hr/supplies", group: "업무 관리" },
  { label: "공용 캘린더", href: "/calendar", group: "업무 관리" },
  { label: "외부 마케팅", href: "/services/external-marketing", group: "외부 마케팅 대행" },
  { label: "수강생 명단 중복 검사", href: "/services/roster-duplicates", group: "도구" },
  { label: "결제자 · 수강생 비교", href: "/services/roster-comparison", group: "도구" },
  { label: "강의 정산 계산기", href: "/tools/settlement-calculator", group: "도구" },
  { label: "연락처 CSV 추출", href: "/services/contact-csv", group: "도구" },
  { label: "유튜브 영상 다운로드", href: "/services/youtube-download", group: "도구" },
  { label: "노바 정산서 검증", href: "/services/nova-settlement-validator", group: "도구" },
];

function normalize(value: string) {
  return value.normalize("NFKC").replace(/\s+/gu, "").toLocaleLowerCase("ko-KR");
}

export function filterDashboardMenus(query: string) {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return DASHBOARD_MENU_SEARCH_ITEMS.slice(0, 6);
  return DASHBOARD_MENU_SEARCH_ITEMS.filter((item) =>
    [item.label, item.group, ...(item.keywords ?? [])].some((value) => normalize(value).includes(normalizedQuery)),
  );
}

export function filterDashboardCourses(courses: readonly DashboardCourseSearchItem[], query: string) {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return [];
  return courses.filter((course) =>
    normalize(course.instructor).includes(normalizedQuery)
    || normalize(course.name).includes(normalizedQuery),
  );
}
