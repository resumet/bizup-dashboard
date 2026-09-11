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
