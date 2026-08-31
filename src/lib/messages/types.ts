export type MessageHistoryItem = {
  id: string;
  detailId: string;
  isTest: boolean;
  templateKey: "paid_confirm" | "paid_invite";
  targetScope: string;
  requestedCount: number;
  successCount: number;
  failedCount: number;
  status: string;
  createdAt: string;
};

export const MESSAGE_TEMPLATE_LABELS: Record<MessageHistoryItem["templateKey"], string> = {
  paid_confirm: "유료강의 결제 확인 안내",
  paid_invite: "유료강의 결제자 초대",
};

export const MESSAGE_SCOPE_LABELS: Record<string, string> = {
  all: "전체 유효 인원",
  filtered: "필터 결과",
  selected: "선택 인원",
  test: "테스트 발송",
};

