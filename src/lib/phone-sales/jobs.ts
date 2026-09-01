export type PhoneSalesContact = {
  name: string;
  phone: string;
  email: string;
  sourceFiles: string[];
};

export type PhoneSalesJobSummary = {
  id: string;
  instructor_name: string;
  free_filenames: string[];
  paid_filenames: string[];
  free_count: number;
  paid_count: number;
  excluded_count: number;
  result_count: number;
  created_at: string;
  updated_at: string;
};

export type PhoneSalesJobDetail = PhoneSalesJobSummary & {
  contacts: PhoneSalesContact[];
};

export const PHONE_SALES_STAFF_CAPACITY = 300;
export const PHONE_SALES_STAFF_COST = 245_000;

export function formatPhoneSalesPhone(value: string) {
  const digits = value.replace(/\D/gu, "");
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return value;
}

export function safePhoneSalesFilenamePart(value: string) {
  return value.trim().replace(/[\\/:*?"<>|]/gu, "_") || "강사명미입력";
}

export function formatPhoneSalesTimestamp(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value ?? "00";
  return `${part("year")}${part("month")}${part("day")}_${part("hour")}${part("minute")}`;
}

export function phoneSalesListFilename(
  instructorName: string,
  createdAt: string | Date,
) {
  return `${safePhoneSalesFilenamePart(instructorName)}_전화세일즈명단_${formatPhoneSalesTimestamp(createdAt)}.csv`;
}

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

export function buildPhoneSalesCsv(contacts: PhoneSalesContact[]) {
  return `\uFEFF${[
    ["이름", "전화번호", "이메일"],
    ...contacts.map((contact) => [
      contact.name,
      formatPhoneSalesPhone(contact.phone),
      contact.email,
    ]),
  ]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n")}`;
}

export function normalizePhoneSalesContacts(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): PhoneSalesContact[] => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const phone = String(record.phone ?? "").replace(/\D/gu, "");
    if (!phone) return [];
    const sourceFiles = Array.isArray(record.sourceFiles)
      ? record.sourceFiles.map((source) => String(source)).filter(Boolean)
      : [];
    return [
      {
        name: String(record.name ?? ""),
        phone,
        email: String(record.email ?? ""),
        sourceFiles,
      },
    ];
  });
}
