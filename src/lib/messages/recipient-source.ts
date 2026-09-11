export const ROSTER_SOURCE_PREFIX = "roster:";

export function rosterSourceId(jobId: string) {
  return `${ROSTER_SOURCE_PREFIX}${jobId}`;
}

export function parseRecipientSource(value: string) {
  return value.startsWith(ROSTER_SOURCE_PREFIX)
    ? { kind: "roster" as const, id: value.slice(ROSTER_SOURCE_PREFIX.length) }
    : { kind: "address-book" as const, id: value };
}

export function messageHistorySourceId(job: { address_book_id: string | null; course_job_id?: string | null }) {
  return job.course_job_id ? rosterSourceId(job.course_job_id) : job.address_book_id ?? "";
}

export function messageSourceMatches(
  sourceId: string,
  message: {
    address_book_id: string | null;
    course_job_id?: string | null;
  },
) {
  const source = parseRecipientSource(sourceId);
  return source.kind === "roster"
    ? message.course_job_id === source.id
    : message.address_book_id === source.id;
}

type MessageSourceRelation = { name: string } | { name: string }[] | null;

export function messageHistorySourceName(job: {
  course_job_id?: string | null;
  address_books?: MessageSourceRelation;
  course_jobs?: MessageSourceRelation;
}) {
  const relation = job.course_job_id ? job.course_jobs : job.address_books;
  const source = Array.isArray(relation) ? relation[0] : relation;
  if (source?.name) return source.name;
  return job.course_job_id ? "삭제된 수강생 명단" : "삭제된 주소록";
}
