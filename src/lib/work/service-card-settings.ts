import { z } from "zod";

export const WORK_SERVICE_CARD_GROUPS = [
  {
    title:"서비스",
    items:[
      {route:"/services/course-operations",title:"강의 운영 자동화"},
      {route:"/services/course-schedule-planner",title:"강의 일정 플래너"},
      {route:"/services/course-webinars",title:"라이브 세미나 대시보드"},
      {route:"/services/course-roster",title:"수강생 명단 분석"},
      {route:"/services/address-books",title:"주소록 매니저"},
      {route:"/services/phone-sales-list",title:"전화 세일즈 명단 만들기"},
      {route:"/services/message-automation",title:"알림톡·문자 자동화"},
      {route:"/services/settlement-analysis",title:"강의별 정산"},
      {route:"/services/cash-flow",title:"자금 흐름"},
      {route:"/services/purchase-analysis",title:"주문결제 매출분석"},
      {route:"/services/ad-performance",title:"광고성과 대시보드"},
    ],
  },
  {
    title:"간편 도구",
    items:[
      {route:"/services/roster-duplicates",title:"수강생 명단 중복 검사"},
      {route:"/services/roster-comparison",title:"결제자·수강생 명단 비교"},
      {route:"/tools/settlement-calculator",title:"강의 정산 계산기"},
      {route:"/services/contact-csv",title:"연락처 CSV 추출"},
      {route:"/services/youtube-download",title:"유튜브 영상 다운로드"},
      {route:"/services/nova-settlement-validator",title:"노바 정산서 검증하기"},
    ],
  },
] as const;

const routes=WORK_SERVICE_CARD_GROUPS.flatMap(group=>group.items.map(item=>item.route));
const routeSchema=z.enum(routes as [string,...string[]]);
export const workServiceCardSettingsSchema=z.object({
  hiddenRoutes:z.array(routeSchema).max(routes.length).transform(value=>[...new Set(value)]),
});
export type WorkServiceCardSettings=z.infer<typeof workServiceCardSettingsSchema>;
export const DEFAULT_WORK_SERVICE_CARD_SETTINGS:WorkServiceCardSettings={hiddenRoutes:[]};
