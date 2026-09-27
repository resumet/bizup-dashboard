import type { WbsItem } from "./types";

export class WbsInputError extends Error {}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new WbsInputError("요청 내용을 확인해 주세요.");
  }
  return value as Record<string, unknown>;
}

function requiredText(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== "string") {
    throw new WbsInputError(`${label}을(를) 입력해 주세요.`);
  }
  const parsed = value.trim();
  if (!parsed || parsed.length > maxLength) {
    throw new WbsInputError(`${label}은(는) 1~${maxLength}자로 입력해 주세요.`);
  }
  return parsed;
}

function optionalText(value: unknown, label: string, maxLength: number): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") {
    throw new WbsInputError(`${label} 형식을 확인해 주세요.`);
  }
  const parsed = value.trim();
  if (parsed.length > maxLength) {
    throw new WbsInputError(`${label}은(는) ${maxLength}자 이내로 입력해 주세요.`);
  }
  return parsed;
}

function optionalDate(value: unknown, label: string): string {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    throw new WbsInputError(`${label} 날짜를 확인해 주세요.`);
  }
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new WbsInputError(`${label} 날짜를 확인해 주세요.`);
  }
  return value;
}

export function parseWbsItems(value: unknown): WbsItem[] {
  if (!Array.isArray(value) || value.length > 500) {
    throw new WbsInputError("WBS 항목은 최대 500개까지 저장할 수 있습니다.");
  }
  const ids = new Set<string>();
  return value.map((raw, index) => {
    const item = record(raw);
    const id = requiredText(item.id, "항목 ID", 120);
    if (ids.has(id)) throw new WbsInputError("항목 ID가 중복되었습니다.");
    ids.add(id);
    const startDate = optionalDate(item.startDate, "시작일");
    const dueDate = optionalDate(item.dueDate, "데드라인");
    if (startDate && dueDate && startDate > dueDate) {
      throw new WbsInputError("데드라인은 시작일보다 빠를 수 없습니다.");
    }
    if (item.completed !== undefined && typeof item.completed !== "boolean") {
      throw new WbsInputError("완료 여부를 확인해 주세요.");
    }
    const position = item.position === undefined ? index : item.position;
    if (!Number.isInteger(position) || (position as number) < 0 || (position as number) > 100000) {
      throw new WbsInputError("항목 순서를 확인해 주세요.");
    }
    return {
      id,
      title: requiredText(item.title, "항목 제목", 200),
      owner: optionalText(item.owner, "담당자", 120),
      stakeholders: optionalText(item.stakeholders, "관계자", 500),
      startDate,
      dueDate,
      description: optionalText(item.description, "설명", 2000),
      completed: item.completed === true,
      position: position as number,
    };
  }).sort((a, b) => a.position - b.position);
}

export function parseWbsItemsBody(value: unknown): WbsItem[] {
  return parseWbsItems(record(value).items);
}

export function parseWbsExpectedUpdatedAt(value: unknown): string | null {
  const revision = record(value).expectedUpdatedAt;
  if (revision === null) return null;
  if (
    typeof revision !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/u.test(revision) ||
    Number.isNaN(Date.parse(revision))
  ) {
    throw new WbsInputError("WBS 수정 기준 시각을 확인해 주세요. 최신 내용을 다시 불러와 주세요.");
  }
  return revision;
}

export function parseWbsTemplateBody(value: unknown) {
  const body = record(value);
  return {
    name: requiredText(body.name, "템플릿 이름", 120),
    items: parseWbsItems(body.items),
  };
}

export function parseWbsCourseId(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(value)) {
    throw new WbsInputError("강의 ID를 확인해 주세요.");
  }
  return value;
}

export function parseWbsTemplateId(value: string): string {
  if (!/^[a-z0-9][a-z0-9_-]{0,119}$/iu.test(value)) {
    throw new WbsInputError("템플릿 ID를 확인해 주세요.");
  }
  return value;
}
