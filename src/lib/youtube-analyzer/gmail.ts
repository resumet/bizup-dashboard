const GOOGLE_ACCOUNT_CHOOSER_URL = "https://accounts.google.com/AccountChooser";
const GMAIL_COMPOSE_URL = "https://mail.google.com/mail/";

type GmailDraft = {
  subject?: string | null;
  body?: string | null;
  signatureMode?: "gmail_default" | "custom";
  customSignature?: string | null;
  course?: GmailCourseContext | null;
};

export type GmailCourseContext = {
  webinarAt: string;
  courseName: string;
  instructorName: string;
};

const koreanCourseDate = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "long",
  day: "numeric",
});

export function buildGmailCourseHeader(course: GmailCourseContext) {
  const parsedDate = new Date(course.webinarAt);
  const webinarDate = Number.isNaN(parsedDate.valueOf())
    ? course.webinarAt.trim()
    : koreanCourseDate.format(parsedDate);
  return [
    `강의 날짜: ${webinarDate || "-"}`,
    `강의명: ${course.courseName.trim() || "-"}`,
    `강사 이름: ${course.instructorName.trim() || "-"}`,
  ].join("\n");
}

export function buildGmailMessage({ body, signatureMode = "gmail_default", customSignature, course }: GmailDraft = {}) {
  const message = [
    course ? buildGmailCourseHeader(course) : "",
    body?.trim() ? body : "",
  ].filter(Boolean).join("\n\n");
  if (signatureMode !== "custom" || !customSignature?.trim()) return message;
  return message ? `${message}\n\n${customSignature}` : customSignature;
}

export function buildGmailComposeWithAccountChooser(recipient: string, draft: GmailDraft = {}) {
  const message = buildGmailMessage(draft);
  const composeParams: Record<string,string> = {
    view: "cm",
    fs: "1",
    tf: "1",
    to: recipient.trim(),
  };
  if (draft.subject?.trim()) composeParams.su = draft.subject.trim();
  if (message) composeParams.body = message;
  const composeUrl = new URL(GMAIL_COMPOSE_URL);
  composeUrl.search = new URLSearchParams(composeParams).toString();

  const accountChooserUrl = new URL(GOOGLE_ACCOUNT_CHOOSER_URL);
  accountChooserUrl.search = new URLSearchParams({
    service: "mail",
    continue: composeUrl.toString(),
  }).toString();

  return accountChooserUrl.toString();
}
