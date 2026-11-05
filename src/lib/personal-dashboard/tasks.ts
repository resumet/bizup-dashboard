import type { ExecutiveAssignmentStatus } from "./types";

export const EXECUTIVE_ASSIGNMENT_STATUS_LABELS: Record<ExecutiveAssignmentStatus, string> = {
  created: "생성됨",
  assigned: "할당됨",
  completed: "완료됨",
};

export type ActiveMention = {
  start: number;
  end: number;
  query: string;
};

export function findActiveMention(value: string, cursor: number): ActiveMention | null {
  const beforeCursor = value.slice(0, Math.max(0, cursor));
  const start = beforeCursor.lastIndexOf("@");
  if (start < 0) return null;

  const previous = start > 0 ? beforeCursor[start - 1] : "";
  if (/[A-Za-z0-9]/u.test(previous)) return null;

  const query = beforeCursor.slice(start + 1);
  if (/[@\s]/u.test(query)) return null;
  return { start, end: cursor, query };
}

export function insertMention(
  value: string,
  mention: ActiveMention,
  name: string,
) {
  const before = value.slice(0, mention.start);
  const after = value.slice(mention.end).replace(/^\s*/u, "");
  const inserted = `${before}@${name} ${after}`;
  return { value: inserted, cursor: before.length + name.length + 2 };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

export function extractAssignedTaskTitle(value: string, personNames: string[]) {
  const names = [...new Set(personNames.map((name) => name.trim()).filter(Boolean))]
    .sort((left, right) => right.length - left.length);

  for (const name of names) {
    const mention = new RegExp(`(^|[^A-Za-z0-9])@${escapeRegExp(name)}(?=$|[^\\p{L}\\p{N}_])`, "u");
    const match = mention.exec(value);
    if (!match) continue;
    const mentionStart = match.index + match[1].length;
    const mentionEnd = mentionStart + name.length + 1;
    const title = `${value.slice(0, mentionStart)} ${value.slice(mentionEnd)}`
      .replace(/\s+/gu, " ")
      .trim();
    return title ? { name, title } : null;
  }

  return null;
}
