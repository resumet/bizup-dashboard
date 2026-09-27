import { WEBINAR_ITEM_ID } from "./webinar-date";

/**
 * Initial WBS based on the 22 named rows in the Notion "작업 트래커".
 * The source's 2025 deadlines are intentionally omitted so new courses start
 * with a schedule that can be set for their own webinar dates.
 */
const NOTION_TASKS = [
  {
    title: "기존 자료 및 기획",
    description: "강사 프로필·인물 사진, 기존 PPT 교안, 상세페이지·강의자료, 출연 유튜브 영상 링크를 수급하고 무료특강 수강생 확보 순서를 기획한다.",
  },
  {
    title: "일정 확정 & PD/장소 예약",
    description: "웨비나 본방송, 앵콜 2회, 리허설 2~3회의 일정을 정하고 스튜디오와 노바 PD 예약을 확인한다.",
  },
  {
    title: "유튜브 신청서 강사님 전달",
    description: "유튜브 신청서를 수급하고 신청자 데이터를 강사에게 전달한다.",
  },
  {
    title: "외부 유튜브 출연 신청",
    description: "초월스토리(두부), 배워야산다, 월받사, 실전부업클럽 등 출연 가능한 외부 유튜브 채널에 연락한다.",
  },
  {
    title: "촬영/업로드 일정 확정",
    description: "촬영·편집 PD와 검수자를 섭외하고 스튜디오를 예약하여 촬영 및 업로드 일정을 확정한다.",
  },
  {
    title: "광고 영상 촬영 진행",
    description: "광고 영상을 촬영한 뒤 촬영 자료를 편집팀에 이관한다.",
  },
  {
    title: "무료 웨비나 상세페이지제작",
    description: "가격과 커리큘럼을 최종 확정하고 무료 웨비나 상세페이지 제작을 요청한다.",
  },
  {
    title: "교안 제작 착수 (PPT→캔바)",
    description: "강사에게 기존 PPT 교안을 미리 받아 Canva로 옮겨 디자인을 시작한다. 원본 기록의 담당자는 황지유님이다.",
  },
  {
    title: "무/유료 강의 등록 & UTM",
    description: "네이버 법인계정에 무료·유료 강의를 등록하고 유튜브 트래픽용 UTM 및 비즈업 계정의 QR 단축링크를 만든다.",
  },
  {
    title: "광고 소재 전달",
    description: "광고 집행용 소재를 강산에게 전달한다.",
  },
  {
    title: "유튜브 촬영/업로드 일정 확정",
    description: "강사에게 촬영 여부와 유튜브 업로드 일정을 확인하고 영상 재활용 비용을 점검한다.",
  },
  {
    title: "교안 제작 완료",
    description: "Canva 교안을 최종 완성하고 기획자의 검수를 받는다.",
  },
  {
    title: "유료 결제 페이지 제작",
    description: "가격·커리큘럼표, 혜택, 동영상과 가로·세로 배너를 수급하여 유료 결제 페이지에 반영한다.",
  },
  {
    title: "유튜브 UTM 전달 & 상시 체크",
    description: "UTM을 전달하고 유튜브 업로드 전 일정을 확인하며 인스타 DM 및 역할 분담(R&R)을 점검한다. 유튜브 RS 채널 UTM 속링크의 무료 랜딩페이지를 대기자 수집 폼으로 바꾸고 강의 시작 시 수집 연락처에 문자를 발송한다.",
  },
  {
    title: "예열 메시지 사전 제작",
    description: "기존 영상 스크립트를 바탕으로 카카오톡 메시지 30개와 플친 메시지 8개를 미리 제작한다.",
  },
  {
    title: "예열 블로그 포스팅 발행",
    description: "예열용 블로그 콘텐츠 2개를 제작하고 발행한다.",
  },
  {
    title: "주요 페이지 단축링크 준비",
    description: "유료 결제페이지, 플친 문의, 커리큘럼, 사후 세일즈 링크의 단축 URL을 준비한다.",
  },
  {
    title: "무료특강 수강생 명단 확보 & 단톡방",
    description: "무료특강 신청자 DB를 정리하고 단톡방을 개설하며 주차·참여 안내 문자를 발송한다.",
  },
  {
    title: "방송용 자료 PD 전달",
    description: "오른쪽 배너, 가격 영상, 유튜브 제목·설명, 첫 화면 배너, 강사 URL을 PD에게 전달하고 QR·지령창 링크를 세팅한다.",
  },
  {
    title: "19:20 라이브 링크 변환",
    description: "PD에게 라이브 링크를 받은 뒤 비즈업 계정의 단축링크와 QR 링크 연결 대상을 라이브 링크로 변경한다.",
  },
  {
    title: "실시간 링크 전환 운영",
    description: "방송 종료 시 단톡방, 앵콜 전 Zoom, 앵콜 종료 후 다시 단톡방으로 링크 연결 대상을 전환한다.",
  },
  {
    title: "웨비나 성과 지표 기록",
    description: "단톡방 시작 인원, 신청자 DB 수, 라이브 시작·최고·종료 인원과 결제 수를 기록한다.",
  },
] as const;

export const DEFAULT_WBS_TEMPLATE = {
  id: "notion-webinar",
  name: "강의 준비·웨비나 기본 템플릿",
  sourceUrl: "https://app.notion.com/p/3e495b2493eb8006bc05c903ee253129",
  items: [
    {
      id: WEBINAR_ITEM_ID,
      title: "무료웨비나",
      description: "강의 상세에 설정된 무료 웨비나 일정입니다.",
      owner: "",
      stakeholders: "",
      startDate: "",
      dueDate: "",
      completed: false,
      position: 0,
    },
    ...NOTION_TASKS.map((task, position) => ({
      id: `notion-${String(position + 1).padStart(2, "0")}`,
      ...task,
      owner: position === 7 ? "황지유" : "",
      stakeholders: position === 1 || position === 3 ? "김지은 (노바)" : "",
      startDate: "",
      dueDate: "",
      completed: false,
      position: position + 1,
    })),
  ],
} as const;
