export type InviteLinkSuggestion = {
  courseName: string;
  optionName: string;
  linkName: string;
  usedAt: string;
};

function normalizeMatchValue(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/gu, "").trim();
}

export function recommendInviteLinks(
  suggestions: InviteLinkSuggestion[],
  courseName: string,
  optionName: string,
  limit = 3,
) {
  const normalizedCourseName = normalizeMatchValue(courseName);
  const normalizedOptionName = normalizeMatchValue(optionName);
  const seenLinks = new Set<string>();

  return suggestions
    .map((suggestion) => {
      const courseMatches =
        normalizedCourseName.length > 0 &&
        normalizeMatchValue(suggestion.courseName) === normalizedCourseName;
      const optionMatches =
        normalizeMatchValue(suggestion.optionName) === normalizedOptionName;

      return {
        suggestion,
        score: (courseMatches ? 2 : 0) + (optionMatches ? 1 : 0),
      };
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        Date.parse(right.suggestion.usedAt) - Date.parse(left.suggestion.usedAt),
    )
    .flatMap(({ suggestion }) => {
      if (seenLinks.has(suggestion.linkName)) return [];
      seenLinks.add(suggestion.linkName);
      return [suggestion];
    })
    .slice(0, limit);
}
