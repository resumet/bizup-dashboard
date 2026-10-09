import type { RichTextNode } from "./types";

export const DEFAULT_CALLOUT_ICON = "💡";
const graphemes = new Intl.Segmenter("ko", { granularity: "grapheme" });
const EMOJI_START = /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|[0-9#*]\uFE0F?\u20E3)/u;

export function decodeCalloutEntities(text: string) {
  return text.replace(/&(?:#(x[\da-f]+|\d+)|nbsp|lt|gt|amp|quot|apos);/giu, (entity, number: string | undefined) => {
    if (number) {
      const value = Number.parseInt(number.replace(/^x/iu, ""), /^x/iu.test(number) ? 16 : 10);
      return value > 0 && value <= 0x10ffff && !(value >= 0xd800 && value <= 0xdfff) ? String.fromCodePoint(value) : entity;
    }
    return ({ "&nbsp;": " ", "&lt;": "<", "&gt;": ">", "&amp;": "&", "&quot;": '"', "&apos;": "'" } as Record<string, string>)[entity.toLowerCase()] ?? entity;
  });
}

export function inlineNodeText(node: RichTextNode): string {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return "\n";
  return node.content?.map(inlineNodeText).join("") ?? "";
}

export function leadingCalloutIcon(text: string) {
  const trimmed = text.trimStart();
  const icon = graphemes.segment(trimmed)[Symbol.iterator]().next().value?.segment as string | undefined;
  if (!icon || !EMOJI_START.test(icon)) return null;
  const rest = trimmed.slice(icon.length);
  if (rest && !/^\s/u.test(rest)) return null;
  return { icon, length: text.length - trimmed.length + icon.length + (rest.match(/^\s*/u)?.[0].length ?? 0) };
}

export function sliceInlineContent(content: RichTextNode[], from: number, to: number): RichTextNode[] {
  const result: RichTextNode[] = [];
  let offset = 0;
  for (const node of content) {
    const length = node.type === "text" ? (node.text?.length ?? 0) : 1;
    const start = Math.max(from, offset);
    const end = Math.min(to, offset + length);
    if (start < end) result.push(node.type === "text"
      ? { ...node, text: node.text?.slice(start - offset, end - offset) }
      : node);
    offset += length;
  }
  return result;
}

export function createCallout(content: RichTextNode[], attrs?: RichTextNode["attrs"]): RichTextNode {
  const body = [...content];
  while (body[0]?.type === "paragraph" && !inlineNodeText(body[0]).trim()) body.shift();
  while (body.at(-1)?.type === "paragraph" && !inlineNodeText(body.at(-1)!).trim()) body.pop();
  const first = body[0];
  const extracted = first?.type === "paragraph" && !first.content?.some((node) => node.marks?.some((mark) => mark.type === "code"))
    ? leadingCalloutIcon(inlineNodeText(first))
    : null;
  if (extracted && (!attrs?.icon || attrs.icon === extracted.icon)) {
    const text = inlineNodeText(first);
    const remaining = sliceInlineContent(first.content ?? [], extracted.length, text.length);
    if (remaining.length) body[0] = { ...first, content: remaining };
    else body.shift();
  }
  while (body[0]?.type === "paragraph" && !inlineNodeText(body[0]).trim()) body.shift();
  return {
    type: "callout",
    attrs: { ...attrs, icon: typeof attrs?.icon === "string" && attrs.icon ? attrs.icon : extracted?.icon ?? DEFAULT_CALLOUT_ICON },
    content: body.length ? body : [{ type: "paragraph" }],
  };
}
