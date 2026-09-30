import type { ReactNode } from "react";
import Image from "next/image";

import type { CourseDocumentBlock, RichTextMark, RichTextNode } from "@/lib/course-documents/types";

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

function safeExternalUrl(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function applyMarks(content: ReactNode, marks: RichTextMark[] | undefined, key: string): ReactNode {
  return (marks ?? []).reduce<ReactNode>((child, mark, index) => {
    const markKey = `${key}-mark-${index}`;
    if (mark.type === "bold") return <strong key={markKey}>{child}</strong>;
    if (mark.type === "italic") return <em key={markKey}>{child}</em>;
    if (mark.type === "underline") return <u key={markKey} className="decoration-foreground/35 underline-offset-3">{child}</u>;
    if (mark.type === "strike") return <s key={markKey}>{child}</s>;
    if (mark.type === "code") return <code key={markKey} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.9em]">{child}</code>;
    if (mark.type === "link") {
      const href = safeExternalUrl(mark.attrs?.href);
      return href ? <a key={markKey} className="font-medium text-primary underline decoration-primary/35 underline-offset-4 transition-colors hover:decoration-primary" href={href} target="_blank" rel="noopener noreferrer">{child}</a> : child;
    }
    return child;
  }, content);
}

function renderRichTextNode(node: RichTextNode, key: string): ReactNode {
  if (node.type === "text") return applyMarks(node.text ?? "", node.marks, key);
  if (node.type === "hardBreak") return <br key={key} />;
  if (node.type === "horizontalRule") return <hr key={key} className="my-10 border-black/10" />;

  if (node.type === "image") {
    const src = safeExternalUrl(node.attrs?.src);
    if (!src) return null;
    const alt = typeof node.attrs?.alt === "string" ? node.attrs.alt : "";
    return <figure key={key} className="my-8 overflow-hidden rounded-2xl border bg-muted/20"><Image src={src} alt={alt} width={1200} height={675} sizes="(max-width: 768px) 100vw, 768px" className="h-auto w-full object-contain" unoptimized /></figure>;
  }

  if (node.type === "buttonLink") {
    const href = safeExternalUrl(node.attrs?.url);
    const label = typeof node.attrs?.label === "string" ? node.attrs.label : "자세히 보기";
    if (!href) return null;
    return <p key={key} className="py-3 text-center"><a className="inline-flex min-h-12 items-center justify-center rounded-xl bg-primary px-6 font-semibold text-primary-foreground transition-opacity hover:opacity-90" href={href} target="_blank" rel="noopener noreferrer">{label}</a></p>;
  }

  const children = node.content?.map((child, index) => renderRichTextNode(child, `${key}-${index}`)) ?? null;
  if (node.type === "table") {
    return (
      <div key={key} className="my-7 overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[32rem] border-collapse text-left text-sm"><tbody>{children}</tbody></table>
      </div>
    );
  }
  if (node.type === "tableRow") return <tr key={key} className="border-b last:border-b-0">{children}</tr>;
  if (node.type === "tableHeader") {
    return <th key={key} colSpan={typeof node.attrs?.colspan === "number" ? node.attrs.colspan : 1} rowSpan={typeof node.attrs?.rowspan === "number" ? node.attrs.rowspan : 1} className="border-r bg-muted/60 px-3 py-2.5 font-semibold last:border-r-0">{children}</th>;
  }
  if (node.type === "tableCell") {
    return <td key={key} colSpan={typeof node.attrs?.colspan === "number" ? node.attrs.colspan : 1} rowSpan={typeof node.attrs?.rowspan === "number" ? node.attrs.rowspan : 1} className="border-r px-3 py-2.5 align-top last:border-r-0">{children}</td>;
  }
  if (node.type === "taskList") return <ul key={key} className="space-y-2">{children}</ul>;
  if (node.type === "taskItem") {
    const checked = node.attrs?.checked === true;
    return (
      <li key={key} className="flex items-start gap-2.5">
        <input type="checkbox" checked={checked} readOnly aria-label={checked ? "완료됨" : "미완료"} className="mt-1.5 size-4 shrink-0 accent-primary" />
        <div className={checked ? "min-w-0 flex-1 text-muted-foreground line-through" : "min-w-0 flex-1"}>{children}</div>
      </li>
    );
  }
  if (node.type === "heading") {
    if (node.attrs?.level === 1) return <h2 key={key} className="pt-5 text-3xl font-bold tracking-tight text-balance sm:text-4xl">{children}</h2>;
    if (node.attrs?.level === 2) return <h3 key={key} className="pt-4 text-2xl font-semibold tracking-tight text-balance">{children}</h3>;
    return <h4 key={key} className="pt-3 text-xl font-semibold tracking-tight text-balance">{children}</h4>;
  }
  if (node.type === "paragraph") return <p key={key} className="min-h-4 whitespace-pre-wrap leading-8 text-pretty">{children}</p>;
  if (node.type === "bulletList") return <ul key={key} className="list-disc space-y-2 pl-6 leading-7">{children}</ul>;
  if (node.type === "orderedList") return <ol key={key} className="list-decimal space-y-2 pl-6 leading-7">{children}</ol>;
  if (node.type === "listItem") return <li key={key} className="pl-1">{children}</li>;
  if (node.type === "blockquote") return <blockquote key={key} className="border-l-3 border-primary/35 pl-5 text-muted-foreground">{children}</blockquote>;
  if (node.type === "codeBlock") return <pre key={key} className="overflow-x-auto rounded-xl bg-neutral-950 p-5 font-mono text-sm leading-7 text-neutral-100"><code>{children}</code></pre>;
  return null;
}

export function DocumentRenderer({ blocks }: { blocks: CourseDocumentBlock[] }) {
  return (
    <div className="space-y-6">
      {blocks.map((block) => {
        if (block.type === "rich_text") return renderRichTextNode(block.content, block.id);
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
