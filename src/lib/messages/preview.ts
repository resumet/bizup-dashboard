const VARIABLE_ALIAS_GROUPS = [
  ["이름", "고객명"],
  ["링크", "링크명", "입장링크"],
  ["강의명", "신청강좌", "강좌명"],
];

export function renderMessagePreview(body: string, variables: Record<string, string>) {
  const missing = new Set<string>();
  const content = body.replace(/#\{([^{}]+)\}/gu, (placeholder, name: string) => {
    let value = Object.hasOwn(variables, name) ? variables[name] : undefined;
    if (value === undefined || value === "") {
      const aliases = VARIABLE_ALIAS_GROUPS.find((group) => group.includes(name));
      const alias = aliases?.find((candidate) =>
        Object.hasOwn(variables, candidate) && variables[candidate] !== "",
      );
      if (alias) value = variables[alias];
    }
    if (value === undefined || value === "") {
      missing.add(name);
      return placeholder;
    }
    return value;
  });
  return { content, missingVariables: [...missing] };
}
