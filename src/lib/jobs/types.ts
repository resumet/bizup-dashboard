import type { StandardField } from "@/lib/import/contract";

export type RosterRow = {
  id: string;
  sourceRowNumber: number;
  normalizedPhone: string;
  isDuplicate: boolean;
  groupChatJoined: boolean;
  memo: string;
  values: Record<StandardField, string>;
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
