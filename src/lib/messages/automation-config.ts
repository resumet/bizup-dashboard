export type VariableInputMode = "address-book-name" | "manual";

const RECIPIENT_NAME_VARIABLES = new Set(["신청자", "성함", "이름"]);

export function canMapVariableToRecipientName(variable: string) {
  return RECIPIENT_NAME_VARIABLES.has(variable.trim());
}

export function getRecipientNameVariables(
  variableModes: Record<string, VariableInputMode>,
) {
  return Object.entries(variableModes)
    .filter(
      ([variable, mode]) =>
        mode === "address-book-name" && canMapVariableToRecipientName(variable),
    )
    .map(([variable]) => variable)
    .sort((left, right) => left.localeCompare(right, "ko-KR"));
}

export function createAutomationTestKey({
  addressBookId,
  contactId,
  templateId,
  variables,
  recipientNameVariables = [],
}: {
  addressBookId: string;
  contactId?: string;
  templateId: string;
  variables: Record<string, string>;
  recipientNameVariables?: string[];
}) {
  const sortedVariables = Object.entries(variables)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => [name, value.trim()]);

  return JSON.stringify([
    addressBookId,
    contactId ?? "",
    templateId,
    sortedVariables,
    [...recipientNameVariables].sort((left, right) =>
      left.localeCompare(right, "ko-KR"),
    ),
  ]);
}
