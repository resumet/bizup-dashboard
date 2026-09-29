import type { WbsItem } from "./types";

function startDateValue(item: WbsItem) {
  return item.startDate || "9999-12-31";
}

/** Shows scheduled work first, ordered from the earliest start date. */
export function sortWbsItemsByStartDate(items: readonly WbsItem[]) {
  return [...items].sort((left, right) => (
    startDateValue(left).localeCompare(startDateValue(right))
    || left.position - right.position
    || left.id.localeCompare(right.id)
  ));
}
