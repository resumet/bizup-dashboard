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

export function selectablePeople(people: string[], inactive: string[]) {
  return [...new Set(people.map(name => name.trim()).filter(name => name && !includesInactivePerson(name, inactive)))];
}

export function includesInactivePerson(value: string, inactive: string[]) {
  const blocked = new Set(inactive.map(name => name.trim()));
  return blocked.has(value.trim()) || value.split(/[,;/·\n]+/u).some(name => blocked.has(name.trim()));
}

export function hasNewInactiveAssignment(
  items: { id: string; owner: string; stakeholders: string }[],
  previous: { id: string; owner: string; stakeholders: string }[],
  inactive: string[],
) {
  const old = new Map(previous.map(item => [item.id, item]));
  return items.some(item => (["owner", "stakeholders"] as const).some(field =>
    includesInactivePerson(item[field], inactive) && item[field].trim() !== old.get(item.id)?.[field].trim()));
}
