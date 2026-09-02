import { startNavigation } from "@/lib/performance/client-navigation";

export function onRouterTransitionStart(
  url: string,
  navigationType: "push" | "replace" | "traverse",
) {
  startNavigation(url, navigationType);
}
