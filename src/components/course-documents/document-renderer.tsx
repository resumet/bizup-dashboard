import type { ReactNode } from "react";
import Image from "next/image";

import type { CourseDocumentBlock } from "@/lib/course-documents/types";

const URL_PATTERN = /(https?:\/\/[^\s]+)/gu;

function linkedText(value: string) {
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const match of value.matchAll(URL_PATTERN)) {
    const index = match.index ?? 0;
    if (index > cursor) parts.push(value.slice(cursor, index));
    const raw = match[0];
    const trailing = raw.match(/[),.!?]+$/u)?.[0] ?? "";
    const url = trailing ? raw.slice(0, -trailing.length) : raw;
    parts.push(<a key={`${index}-${url}`} className="font-medium text-primary underline underline-offset-4" href={url} target="_blank" rel="noopener noreferrer">{url}</a>);
    if (trailing) parts.push(trailing);
    cursor = index + raw.length;
  }
  if (cursor < value.length) parts.push(value.slice(cursor));
  return parts;
}

export function DocumentRenderer({ blocks }: { blocks: CourseDocumentBlock[] }) {
  return (
    <div className="space-y-6">
      {blocks.map((block) => {
        if (block.type === "heading1") return <h2 key={block.id} className="pt-4 text-3xl font-bold tracking-tight text-balance sm:text-4xl">{block.content}</h2>;
        if (block.type === "heading2") return <h3 key={block.id} className="pt-3 text-2xl font-semibold tracking-tight text-balance">{block.content}</h3>;
        if (block.type === "paragraph") return <p key={block.id} className="whitespace-pre-wrap leading-8 text-pretty">{linkedText(block.content)}</p>;
        if (block.type === "unordered_list") return <ul key={block.id} className="list-disc space-y-2 pl-6 leading-7">{block.items.filter(Boolean).map((item, index) => <li key={`${block.id}-${index}`}>{linkedText(item)}</li>)}</ul>;
        if (block.type === "ordered_list") return <ol key={block.id} className="list-decimal space-y-2 pl-6 leading-7">{block.items.filter(Boolean).map((item, index) => <li key={`${block.id}-${index}`}>{linkedText(item)}</li>)}</ol>;
        if (block.type === "image") return <figure key={block.id} className="overflow-hidden rounded-2xl border bg-muted/20"><Image src={block.url} alt={block.alt} width={1200} height={675} sizes="(max-width: 768px) 100vw, 768px" className="h-auto w-full object-contain" unoptimized /></figure>;
        if (block.type === "link") return <p key={block.id}><a className="font-medium text-primary underline underline-offset-4" href={block.url} target="_blank" rel="noopener noreferrer">{block.label}</a></p>;
        if (block.type === "cta") return <p key={block.id} className="py-2 text-center"><a className="inline-flex min-h-12 items-center justify-center rounded-xl bg-primary px-6 font-semibold text-primary-foreground transition-opacity hover:opacity-90" href={block.url} target="_blank" rel="noopener noreferrer">{block.label}</a></p>;
        return null;
      })}
    </div>
  );
}
