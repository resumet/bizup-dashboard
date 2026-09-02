import { isCourseLinkVariable } from "@/lib/messages/course-template-options";

export function stripDirectalkButtonLinkScheme(value: string) {
  return value.trim().replace(/^https:\/\//iu, "");
}

export function normalizeDirectalkVariables(
  variables: Record<string, string>,
) {
  return Object.fromEntries(
    Object.entries(variables).map(([key, value]) => [
      key,
      isCourseLinkVariable(key)
        ? stripDirectalkButtonLinkScheme(value)
        : value,
    ]),
  );
}
