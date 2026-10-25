import type { WbsItem } from "./types";
import { applyTemplateToCourse, WEBINAR_ITEM_ID } from "./webinar-date";

// A template keeps each task's instructions while clearing course-specific progress.
export function reusableItems(items: WbsItem[]): WbsItem[] {
  return [...items]
    .sort((left, right) => left.position - right.position)
    .map((item, position) => ({
      id: item.id,
      title: item.title,
      owner: item.owner,
      stakeholders: item.stakeholders,
      startDate: item.startDate,
      dueDate: item.dueDate,
      description: item.description ?? "",
      completed: false,
      position,
      ...(item.link ? { link: { ...item.link } } : {}),
    }));
}

function normalizedTitle(item: WbsItem) {
  return item.title.trim().replace(/\s+/gu, " ");
}

function linkKey(item: WbsItem) {
  return item.link ? `${item.link.type}\u0000${item.link.url}\u0000${item.link.label}` : "";
}

function legacySimilarity(template: WbsItem, existing: WbsItem) {
  let score = 0;
  if (template.owner && template.owner === existing.owner) score += 1;
  if (template.stakeholders && template.stakeholders === existing.stakeholders) score += 1;
  if (template.description && template.description === existing.description) score += 2;
  if (template.startDate && template.startDate === existing.startDate) score += 1;
  if (template.dueDate && template.dueDate === existing.dueDate) score += 1;
  if (linkKey(template) && linkKey(template) === linkKey(existing)) score += 3;
  return score;
}

/**
 * Synchronizes a saved course WBS with the latest template while retaining only
 * course progress. Template IDs become the stable identity for future syncs.
 */
export function mergeTemplateItems(
  existingItems: WbsItem[],
  templateItems: WbsItem[],
  targetWebinarDate: string,
): WbsItem[] {
  const existing = [...existingItems].sort((left, right) => left.position - right.position);
  const template = applyTemplateToCourse(templateItems, targetWebinarDate)
    .sort((left, right) => left.position - right.position);
  const used = new Set<number>();
  const hasStableTaskIdentity = template.some((templateItem) =>
    templateItem.id !== WEBINAR_ITEM_ID
    && existing.some((existingItem) => existingItem.id === templateItem.id));
  const allowLegacyPositionFallback = existing.length === template.length && !hasStableTaskIdentity;

  function available(predicate: (item: WbsItem) => boolean) {
    return existing
      .map((item, index) => ({ item, index }))
      .filter((entry) => !used.has(entry.index) && predicate(entry.item));
  }

  return template.map((item, position) => {
    let matched = available((candidate) => candidate.id === item.id)[0];
    if (!matched && item.id === WEBINAR_ITEM_ID) {
      matched = available((candidate) => candidate.id === WEBINAR_ITEM_ID
        || normalizedTitle(candidate).replace(/\s+/gu, "") === "무료웨비나")[0];
    }
    if (!matched) {
      const titleMatches = available((candidate) => normalizedTitle(candidate) === normalizedTitle(item));
      if (titleMatches.length === 1) matched = titleMatches[0];
    }
    if (!matched && linkKey(item)) {
      const linkMatches = available((candidate) => linkKey(candidate) === linkKey(item));
      if (linkMatches.length === 1) matched = linkMatches[0];
    }
    if (!matched) {
      const similarityMatches = available((candidate) => legacySimilarity(item, candidate) >= 3)
        .sort((left, right) => legacySimilarity(item, right.item) - legacySimilarity(item, left.item));
      if (
        similarityMatches.length
        && (similarityMatches.length === 1
          || legacySimilarity(item, similarityMatches[0].item) > legacySimilarity(item, similarityMatches[1].item))
      ) {
        matched = similarityMatches[0];
      }
    }
    if (!matched && allowLegacyPositionFallback && !used.has(position)) {
      matched = { item: existing[position], index: position };
    }
    if (matched) used.add(matched.index);
    return {
      ...item,
      completed: matched?.item.completed ?? false,
      position,
    };
  });
}
