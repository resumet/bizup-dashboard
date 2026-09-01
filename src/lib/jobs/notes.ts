export const COURSE_JOB_NOTE_MAX_LENGTH = 2_000;

export type CourseJobNote = {
  id: string;
  content: string;
  createdBy: string;
  authorEmail: string;
  createdAt: string;
  updatedAt: string;
};

export function parseCourseJobNoteContent(value: unknown) {
  if (typeof value !== "string") {
    throw new Error("메모 내용을 입력해 주세요.");
  }

  const content = value.trim();
  if (!content) throw new Error("메모 내용을 입력해 주세요.");
  if (Array.from(content).length > COURSE_JOB_NOTE_MAX_LENGTH) {
    throw new Error(
      `메모는 최대 ${COURSE_JOB_NOTE_MAX_LENGTH.toLocaleString("ko-KR")}자까지 입력할 수 있습니다.`,
    );
  }
  return content;
}

export function toCourseJobNote(row: {
  id: string;
  content: string;
  created_by: string;
  author_email: string;
  created_at: string;
  updated_at: string;
}): CourseJobNote {
  return {
    id: row.id,
    content: row.content,
    createdBy: row.created_by,
    authorEmail: row.author_email,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
