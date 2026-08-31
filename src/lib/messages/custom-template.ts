export function getTemplateInputVariables(
  applicantVariable: string,
  variableNames: string | string[],
) {
  const names = Array.isArray(variableNames) ? variableNames : [variableNames];
  return [...new Set(names.map((variable) => variable.trim()))].filter(
    (variable) => variable && variable !== applicantVariable.trim(),
  );
}

export function getTemplateVariables(
  applicantVariable: string,
  variableNames: string | string[],
) {
  const names = Array.isArray(variableNames) ? variableNames : [variableNames];
  return [
    ...new Set(
      [applicantVariable, ...names]
        .map((variable) => variable.trim())
        .filter(Boolean),
    ),
  ];
}

export function parseTemplateVariableValues(
  value: unknown,
  requiredVariables: string[],
) {
  const source =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const variables = Object.fromEntries(
    requiredVariables.map((variable) => [
      variable,
      typeof source[variable] === "string" ? source[variable].trim() : "",
    ]),
  );
  const missing = requiredVariables.filter((variable) => !variables[variable]);
  if (missing.length > 0) {
    throw new Error(`템플릿 변수 값을 입력해 주세요: ${missing.join(", ")}`);
  }
  return variables;
}

export function buildRecipientTemplateVariables(
  inputVariables: Record<string, string>,
  recipientNameVariables: string | string[],
  recipientName: string,
) {
  const variables = Array.isArray(recipientNameVariables)
    ? recipientNameVariables
    : [recipientNameVariables];
  return {
    ...inputVariables,
    ...Object.fromEntries(
      variables.filter(Boolean).map((variable) => [variable, recipientName]),
    ),
  };
}
