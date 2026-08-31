export type ParsedShoongGuide = {
  name: string;
  templateCode: string;
  sendType: string;
  variableNames: string[];
  applicantVariable: string;
  courseVariable: string;
};

const APPLICANT_VARIABLE_PATTERN = /신청자|고객명|고객이름|수신자|성명|이름/u;

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function parseName(guide: string, templateCode: string) {
  const lines = guide
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  const guideTitleIndex = lines.findIndex((line) =>
    line.includes("API 연동 가이드"),
  );
  const candidates =
    guideTitleIndex >= 0 ? lines.slice(guideTitleIndex + 1) : lines;
  const name = candidates.find(
    (line) =>
      !/^(코드 예제|외부 플랫폼 연동|엔드포인트|POST|요청 헤더|Header|요청 파라미터|Parameter|Flat|Nested|cURL|JavaScript|Python|Java|Go|PHP|응답 예시|에러 코드)/iu.test(
        line,
      ) &&
      !line.includes("http") &&
      !line.includes("templatecode") &&
      line.length <= 80,
  );
  return name || templateCode;
}

export function parseShoongIntegrationGuide(value: unknown): ParsedShoongGuide {
  const guide = typeof value === "string" ? value.trim() : "";
  if (!guide) throw new Error("Shoong API 연동 가이드를 붙여넣어 주세요.");
  if (guide.length > 100_000) {
    throw new Error("API 연동 가이드는 100,000자 이하여야 합니다.");
  }

  const templateCode =
    guide
      .match(
        /["']channelConfig\.templatecode["']\s*:\s*["']([^"']+)["']/iu,
      )?.[1]
      ?.trim() ||
    guide.match(/["']templatecode["']\s*:\s*["']([^"']+)["']/iu)?.[1]?.trim();
  if (!templateCode) {
    throw new Error("가이드에서 channelConfig.templatecode를 찾지 못했습니다.");
  }

  const sendType = guide
    .match(/["']sendType["']\s*:\s*["']([^"']+)["']/iu)?.[1]
    ?.trim()
    .toLowerCase();
  if (!sendType) {
    throw new Error("가이드에서 sendType을 찾지 못했습니다.");
  }

  const flatVariables = [
    ...guide.matchAll(/["']variables\.([^"']+)["']\s*:/giu),
  ].map((match) => match[1]);
  const parameterVariables = [
    ...guide.matchAll(/(?:^|\s)variables\.([^\s|"']+)/gimu),
  ].map((match) => match[1].replace(/[,:;]+$/u, ""));
  const nestedBlock =
    guide.match(/["']variables["']\s*:\s*\{([\s\S]*?)\}/iu)?.[1] ?? "";
  const nestedVariables = [
    ...nestedBlock.matchAll(/["']([^"']+)["']\s*:/gu),
  ].map((match) => match[1]);
  const variableNames = unique([
    ...flatVariables,
    ...nestedVariables,
    ...parameterVariables,
  ]);
  if (variableNames.length === 0) {
    throw new Error("가이드에서 variables.* 템플릿 변수를 찾지 못했습니다.");
  }

  const applicantVariable =
    variableNames.find((variable) =>
      APPLICANT_VARIABLE_PATTERN.test(variable),
    ) || variableNames[0];
  const courseVariable =
    variableNames.find((variable) => variable !== applicantVariable) ||
    applicantVariable;

  return {
    name: parseName(guide, templateCode),
    templateCode,
    sendType,
    variableNames,
    applicantVariable,
    courseVariable,
  };
}

export function getTemplateSendTypeLabel(sendType: string) {
  const normalized = sendType.trim().toLowerCase();
  if (normalized === "sms") return "문자 SMS";
  if (normalized === "lms") return "문자 LMS";
  if (normalized === "ai" || normalized === "at") return "알림톡";
  return "";
}

export function formatTemplateSelectionLabel(sendType: string, name: string) {
  const normalized = sendType.trim();
  const typeLabel =
    getTemplateSendTypeLabel(normalized) || normalized.toUpperCase() || "기타";
  return `[${typeLabel}] ${name}`;
}
