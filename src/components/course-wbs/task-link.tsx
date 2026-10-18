import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { taskLink, taskLinkHref } from "@/lib/course-wbs/task-links";
import type { WbsItem } from "@/lib/course-wbs/types";

export function WbsTaskLink({ item, courseId, templateItems }: {
  item: Pick<WbsItem, "id" | "title" | "link">; courseId: string; templateItems?: WbsItem[];
}) {
  const link = taskLink(item, templateItems);
  if (!link) return null;
  return <Link href={taskLinkHref(link, courseId)} target="_blank" rel="noopener noreferrer" prefetch={false} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
    {link.label}<ExternalLink className="size-3" aria-hidden="true" />
  </Link>;
}
