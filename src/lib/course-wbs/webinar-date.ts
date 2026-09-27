import { toKoreaDate } from "@/lib/course-operations/schedule";

import type { WbsItem } from "./types";

export const WEBINAR_ITEM_ID = "course-free-webinar";

const DAY_MS = 24 * 60 * 60 * 1000;

function dateValue(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return null;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(timestamp)) return null;
  return new Date(timestamp).toISOString().slice(0, 10) === value ? timestamp : null;
}

function shiftDate(value: string, days: number): string {
  const timestamp = dateValue(value);
  if (timestamp === null) return value;
  const shifted = new Date(timestamp + days * DAY_MS).toISOString().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/u.test(shifted) ? shifted : value;
}

export function webinarDateFromTimestamp(value: string | null): string {
  return value ? toKoreaDate(value) : "";
}

export function webinarDayLabel(taskDate: string, webinarDate: string): string {
  const task = dateValue(taskDate);
  const webinar = dateValue(webinarDate);
  if (task === null || webinar === null) return "";
  const days = Math.round((task - webinar) / DAY_MS);
  if (days === 0) return "D-Day";
  return days < 0 ? `D-${Math.abs(days)}` : `D+${days}`;
}

function hasWebinarTitle(title: string): boolean {
  return title.replace(/\s+/gu, "") === "무료웨비나";
}

function isWebinarItem(item: WbsItem): boolean {
  return item.id === WEBINAR_ITEM_ID || hasWebinarTitle(item.title);
}

export function syncWebinarItem(items: WbsItem[], webinarDate: string): WbsItem[] {
  const ordered = [...items].sort((left, right) => left.position - right.position);
  const existing = ordered.find((item) => item.id === WEBINAR_ITEM_ID)
    ?? ordered.find((item) => hasWebinarTitle(item.title));
  const anchor: WbsItem = existing ? {
    ...existing,
    // The course detail is the source of truth for these fields.
    id: WEBINAR_ITEM_ID,
    title: "무료웨비나",
    startDate: webinarDate,
    dueDate: webinarDate,
  } : {
    id: WEBINAR_ITEM_ID,
    title: "무료웨비나",
    owner: "",
    stakeholders: "",
    startDate: webinarDate,
    dueDate: webinarDate,
    description: "강의 상세에 설정된 무료 웨비나 일정입니다.",
    completed: false,
    position: 0,
  };
  const result = ordered.filter((item) => !isWebinarItem(item));
  if (existing) {
    const index = ordered.findIndex((item) => item === existing);
    const precedingTasks = ordered.slice(0, index).filter((item) => !isWebinarItem(item)).length;
    result.splice(precedingTasks, 0, anchor);
  } else {
    result.unshift(anchor);
  }
  return result.map((item, position) => ({ ...item, position }));
}

export function applyTemplateToCourse(items: WbsItem[], targetWebinarDate: string): WbsItem[] {
  const anchor = items.find((item) => item.id === WEBINAR_ITEM_ID)
    ?? items.find((item) => hasWebinarTitle(item.title));
  const source = dateValue(anchor?.dueDate || anchor?.startDate || "");
  const target = dateValue(targetWebinarDate);
  const days = source !== null && target !== null ? Math.round((target - source) / DAY_MS) : 0;
  const shifted = items.map((item) => ({
    ...item,
    startDate: days ? shiftDate(item.startDate, days) : item.startDate,
    dueDate: days ? shiftDate(item.dueDate, days) : item.dueDate,
  }));
  return syncWebinarItem(shifted, targetWebinarDate);
}
