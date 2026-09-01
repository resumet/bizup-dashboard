export const COURSE_NOTE_MAX_LENGTH = 5_000;

export type CourseNote = {
  id: string;
  content: string;
  createdBy: string;
  authorEmail: string;
  createdAt: string;
  updatedAt: string;
};

export type CourseNoteToken =
  | { type: "text"; value: string }
  | { type: "link"; value: string; href: string };

const URL_PATTERN = /https?:\/\/[^\s<>"']+/giu;
const TRAILING_PUNCTUATION_PATTERN = /[.,!?;:)}\]]+$/u;

export function parseCourseNoteContent(value: unknown) {
  if (typeof value !== "string") {
    throw new Error("메모 내용을 입력해 주세요.");
  }
  const content = value.trim();
  if (!content) throw new Error("메모 내용을 입력해 주세요.");
  if (Array.from(content).length > COURSE_NOTE_MAX_LENGTH) {
    throw new Error(
      `메모는 최대 ${COURSE_NOTE_MAX_LENGTH.toLocaleString("ko-KR")}자까지 입력할 수 있습니다.`,
    );
  }
  return content;
}

export function tokenizeCourseNoteContent(content: string): CourseNoteToken[] {
  const tokens: CourseNoteToken[] = [];
  let cursor = 0;
  for (const match of content.matchAll(URL_PATTERN)) {
    const index = match.index;
    const raw = match[0];
    if (index > cursor) {
      tokens.push({ type: "text", value: content.slice(cursor, index) });
    }
    const trailing = raw.match(TRAILING_PUNCTUATION_PATTERN)?.[0] ?? "";
    const candidate = trailing ? raw.slice(0, -trailing.length) : raw;
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        tokens.push({ type: "link", value: candidate, href: parsed.toString() });
      } else {
        tokens.push({ type: "text", value: candidate });
      }
    } catch {
      tokens.push({ type: "text", value: candidate });
    }
    if (trailing) tokens.push({ type: "text", value: trailing });
    cursor = index + raw.length;
  }
  if (cursor < content.length) {
    tokens.push({ type: "text", value: content.slice(cursor) });
  }
  return tokens;
}

export function toCourseNote(row: {
  id: string;
  content: string;
  created_by: string;
  author_email: string;
  created_at: string;
  updated_at: string;
}): CourseNote {
  return {
    id: row.id,
    content: row.content,
    createdBy: row.created_by,
    authorEmail: row.author_email,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
