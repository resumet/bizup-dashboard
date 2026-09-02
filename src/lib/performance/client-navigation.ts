export type PendingNavigation = {
  from: string;
  url: string;
  navigationType: "push" | "replace" | "traverse";
  startedAt: number;
};

let pendingNavigation: PendingNavigation | null = null;

export function startNavigation(
  url: string,
  navigationType: PendingNavigation["navigationType"],
) {
  pendingNavigation = {
    from: `${window.location.pathname}${window.location.search}`,
    url,
    navigationType,
    startedAt: performance.now(),
  };
}

export function consumeNavigation(): PendingNavigation | null {
  const current = pendingNavigation;
  pendingNavigation = null;
  return current;
}
