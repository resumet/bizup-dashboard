import type { StandardField } from "@/lib/import/contract";
import type { LinkedStudentValues } from "./linked-student";

export type RosterRow = {
  id: string;
  sourceRowNumber: number;
  normalizedPhone: string;
  isDuplicate: boolean;
  groupChatJoined: boolean;
  isExtraParticipant: boolean;
  isManuallyAdded: boolean;
  memo: string;
  values: Record<StandardField, string> & LinkedStudentValues & Partial<Record<"paymentMethod" | "paymentId" | "paymentAmount" | "originalPaymentAmount" | "rs" | "orderRecordKey" | "orderStatus" | "refundPaymentAmount" | "refundFraction" | "refundAmount" | "refundApplicationDate" | "refundReason" | "refundReasonDetail" | "refundSource" | "refundedAt" | "refundedBy", string>> & { partialRefunded?: boolean };
};

export type RosterFilters = {
  keyword: string;
  courseName: string;
  optionName: string;
  source: string;
  adMedia: string;
  groupChat: "all" | "notJoined";
};

export type RosterSort = "original" | "nameAsc" | "nameDesc";

export type LinkedCourseOptionInvite = {
  optionName: string;
  entryCode: string;
  linkName: string;
};

export const EMPTY_ROSTER_FILTERS: RosterFilters = {
  keyword: "",
  courseName: "",
  optionName: "",
  source: "",
  adMedia: "",
  groupChat: "all",
};
