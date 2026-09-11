// Only these existing button variables expect a URL without its HTTPS scheme.
// Other URL variables may be used directly in the message body.
const BUTTON_LINK_VARIABLES = new Set(["링크", "링크명", "입장링크"]);

export function stripDirectalkButtonLinkScheme(value: string) {
  return value.trim().replace(/^https:\/\//iu, "");
}

export function normalizeDirectalkVariables(
  variables: Record<string, string>,
) {
  return Object.fromEntries(
    Object.entries(variables).map(([key, value]) => [
      key,
      BUTTON_LINK_VARIABLES.has(key.trim())
        ? stripDirectalkButtonLinkScheme(value)
        : value,
    ]),
  );
}
