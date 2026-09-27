import type { WbsItem } from "./types";

export function reorderWbsItems(
  items: WbsItem[],
  sourceId: string,
  targetId: string,
  placement: "before" | "after",
): WbsItem[] | null {
  if (sourceId === targetId) return null;
  const current = [...items].sort((a, b) => a.position - b.position);
  const moving = current.find((item) => item.id === sourceId);
  if (!moving) return null;
  const remaining = current.filter((item) => item.id !== sourceId);
  const targetIndex = remaining.findIndex((item) => item.id === targetId);
  if (targetIndex < 0) return null;
  remaining.splice(targetIndex + (placement === "after" ? 1 : 0), 0, moving);
  if (remaining.every((item, index) => item.id === current[index].id)) return null;
  return remaining.map((item, position) => ({ ...item, position }));
}
