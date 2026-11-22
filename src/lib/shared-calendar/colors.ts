import type { MeetingType } from "./types";
export { contrastingColorStyle as calendarChipStyle } from "../color-contrast";

export const defaultCalendarColors = {
  instructor_zoom: "#2563eb",
  rehearsal: "#facc15",
  webinar: "#7c3aed",
  weekly_meeting: "#059669",
  youtube_filming: "#db2777",
  leave: "#fda4af",
  external_marketing_creative: "#fb923c",
};

export function meetingTypeColor(type: MeetingType) {
  if (type.color) return type.color.toLowerCase();
  if (type.code && Object.hasOwn(defaultCalendarColors, type.code)) {
    return defaultCalendarColors[type.code as keyof typeof defaultCalendarColors];
  }
  // Imported and older custom types also need a stable color before an admin picks one.
  let hash = 0;
  for (const character of type.id) hash = Math.imul(hash, 31) + character.charCodeAt(0);
  return "#" + (hash & 0xffffff).toString(16).padStart(6, "0");
}

export function suggestedMeetingColor(types: MeetingType[]) {
  const used = new Set([...types.map(meetingTypeColor), ...Object.values(defaultCalendarColors)]);
  for (const color of ["#0891b2", "#9333ea", "#84cc16", "#e11d48", "#60a5fa", "#fde68a"]) {
    if (!used.has(color)) return color;
  }
  let index = types.length;
  let color: string;
  do {
    color = "#" + (Math.imul(++index, 0x9e3779) & 0xffffff).toString(16).padStart(6, "0");
  } while (used.has(color));
  return color;
}
