/** Preserve each entered field as one reusable choice, including combined names. */
export function peopleInItems(items: unknown): string[] {
  if (!Array.isArray(items)) return [];
  const names = new Set<string>();
  for (const item of items) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) continue;
    const fields = item as Record<string, unknown>;
    for (const field of ["owner", "stakeholders"] as const) {
      const value = fields[field];
      if (typeof value !== "string") continue;
      const name = value.trim();
      if (name && name.length <= 500) names.add(name);
    }
  }
  return [...names];
}
