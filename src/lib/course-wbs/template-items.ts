import type { WbsItem } from "./types";

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
    }));
}
