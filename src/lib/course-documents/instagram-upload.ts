import type { CourseDocumentSummary } from "./types";

export function instagramExternalDmPath(document?: Pick<CourseDocumentSummary, "slug" | "status">) {
  if (!document || document.status !== "published" || !document.slug.trim()) return "";
  return `/article/${encodeURIComponent(document.slug)}`;
}

export function instagramDmMaterialValue(
  dmMaterial: string,
  document?: Pick<CourseDocumentSummary, "slug" | "status">,
) {
  return dmMaterial.trim() || instagramExternalDmPath(document);
}

export function instagramDmMaterialHref(value: string) {
  const normalized = value.trim();
  if (normalized.startsWith("/")) return normalized;
  try {
    const url = new URL(normalized);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
  } catch {
    return "";
  }
}
