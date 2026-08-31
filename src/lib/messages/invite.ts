export type InviteValues = { entryCode: string; linkName: string };

export type CourseOptionInviteSource = InviteValues & { optionName: string };

export function optionKey(optionName: string) {
  return optionName.trim() || "__no_option";
}

export function optionLabel(key: string) {
  return key === "__no_option" ? "옵션 없음" : key;
}

function normalizeOptionName(value: string) {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("ko-KR")
    .replace(/[\s_()\[\]{}\-./]/gu, "");
}

function relaxedOptionName(value: string) {
  return normalizeOptionName(value).replace(/(?:반|과정|코스)$/u, "");
}

export function buildCourseOptionInviteMap(
  rosterOptionNames: string[],
  courseOptions: CourseOptionInviteSource[],
) {
  const result: Record<string, InviteValues> = {};
  for (const rosterOptionName of new Set(rosterOptionNames)) {
    const key = optionKey(rosterOptionName);
    const normalized = normalizeOptionName(rosterOptionName);
    const exact = courseOptions.find(
      (option) => normalizeOptionName(option.optionName) === normalized,
    );
    const relaxed = relaxedOptionName(rosterOptionName);
    const relaxedMatches = exact
      ? []
      : courseOptions.filter(
          (option) =>
            relaxed && relaxedOptionName(option.optionName) === relaxed,
        );
    const matched = exact ?? (relaxedMatches.length === 1 ? relaxedMatches[0] : null);
    if (matched) {
      result[key] = {
        entryCode: matched.entryCode,
        linkName: matched.linkName,
      };
    }
  }
  return result;
}

export function validateInviteValues(values: InviteValues) {
  const errors: string[] = [];
  const entryCode = values.entryCode.trim();
  const linkName = values.linkName.trim();
  if (!entryCode || !linkName)
    errors.push("입장코드와 링크는 모두 입력해야 합니다.");
  const codeLength = Array.from(entryCode).length;
  if (entryCode && (codeLength < 4 || codeLength > 6))
    errors.push("입장코드는 4~6글자여야 합니다.");
  if (linkName) {
    try {
      const url = new URL(linkName);
      if (url.protocol !== "https:")
        errors.push("링크는 https:// 형식이어야 합니다.");
    } catch {
      errors.push("링크는 유효한 https:// 주소여야 합니다.");
    }
  }
  return errors;
}
