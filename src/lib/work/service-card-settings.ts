import { z } from "zod";

import { WORK_QUICK_TOOL_LINKS } from "./quick-tools";

export const WORK_SERVICE_CARD_GROUPS = [
  {
    title:"강의운영",
    items:[
      {route:"/services/course-operations",title:"강의 운영 자동화"},
      {route:"/services/instagram-management",title:"인스타그램 관리"},
      {route:"/services/course-operations/students-settlements",title:"수강생관리 및 정산"},
      {route:"/services/course-wbs",title:"강의 WBS"},
      {route:"/services/course-schedule-planner",title:"강의 일정 플래너"},
      {route:"/services/course-webinars",title:"라이브 웨비나 대시보드"},
      {route:"/services/settlement-analysis",title:"강의별 정산"},
      {route:"/services/cash-flow",title:"자금 흐름"},
      {route:"/services/purchase-analysis",title:"주문결제 매출분석"},
      {route:"/services/ad-performance",title:"광고성과"},
    ],
  },
  {
    title:"명단관리",
    items:[
      {route:"/services/course-roster",title:"수강생 명단 분석"},
      {route:"/services/address-books",title:"주소록 매니저"},
      {route:"/services/phone-sales-list",title:"전화 세일즈 명단 만들기"},
      {route:"/services/message-automation",title:"알림톡·문자 자동화"},
    ],
  },
] as const;

const routes=WORK_SERVICE_CARD_GROUPS.flatMap(group=>group.items.map(item=>item.route));
const acceptedRoutes=[...routes,...WORK_QUICK_TOOL_LINKS.map(item=>item.href)];
const routeSchema=z.enum(acceptedRoutes as [string,...string[]]);
const currentRouteSet=new Set<string>(routes);
export const workServiceCardSettingsSchema=z.object({
  hiddenRoutes:z.array(routeSchema).max(acceptedRoutes.length).transform(value=>
    [...new Set(value)].filter(route=>currentRouteSet.has(route)),
  ),
});
export type WorkServiceCardSettings=z.infer<typeof workServiceCardSettingsSchema>;
export const DEFAULT_WORK_SERVICE_CARD_SETTINGS:WorkServiceCardSettings={hiddenRoutes:[]};
