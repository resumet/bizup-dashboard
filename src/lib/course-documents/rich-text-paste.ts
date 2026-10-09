import type { RichTextNode } from "./types";

const CHECKBOX_SELECTOR = [
  'input[type="checkbox"]',
  '[role="checkbox"]',
  '[class*="checkbox" i]',
  '[class*="to-do" i]',
].join(",");

const CHECKED_TEXT_PATTERN = /^\s*(?:☑|✅|✔|✓|\[x\])\s*/iu;
const UNCHECKED_TEXT_PATTERN = /^\s*(?:☐|□|\[\s\])\s*/u;

function calloutParagraphs(text: string, markdown: boolean): RichTextNode[] {
  return text.replace(/^\n|\n$/gu, "").split("\n").map((originalLine) => {
    const line = markdown ? originalLine.replace(/\\$/u, "") : originalLine;
    const content: RichTextNode[] = [];
    // Only interpret inline formatting in callouts. Ordinary pasted text stays literal.
    const tokens = markdown ? /(`+)([^`]+)\1|\*\*([^*\n]+)\*\*/gu : /$^/gu;
    let offset = 0;
    for (const match of line.matchAll(tokens)) {
      if (match.index > offset) content.push({ type: "text", text: line.slice(offset, match.index) });
      content.push({ type: "text", text: match[2] ?? match[3], marks: [{ type: match[2] ? "code" : "bold" }] });
      offset = match.index + match[0].length;
    }
    if (offset < line.length) content.push({ type: "text", text: line.slice(offset) });
    return { type: "paragraph", ...(content.length ? { content } : {}) };
  });
}

function maskCalloutCode(text: string) {
  return text.replace(
    /^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^ {0,3}\1[^\n]*(?:\n|$)|(?![\s\S]))|(`+)[^`\n]*\2/gmu,
    (code) => " ".repeat(code.length),
  );
}

/** Imports Notion's Markdown callouts without interpreting arbitrary HTML as markup. */
export function notionCalloutPasteDocument(text: string): { type: "doc"; content: RichTextNode[] } | null {
  const normalized = text.replace(/\r\n?/gu, "\n");
  // Tags in fenced or inline code are examples, not callouts.
  const searchable = maskCalloutCode(normalized);
  const content: RichTextNode[] = [];
  let offset = 0;
  for (const match of searchable.matchAll(/(\\?(?:<|&lt;)aside(?:\s[^<>]*?)?(?:>|&gt;))([\s\S]*?)(\\?(?:<|&lt;)\/aside\s*(?:>|&gt;))/giu)) {
    const before = normalized.slice(offset, match.index).replace(/\n$/u, "");
    if (before) content.push(...calloutParagraphs(before, false));
    const openingLength = match[1].length;
    const closingOffset = match[0].length - match[3].length;
    content.push({
      type: "blockquote",
      content: calloutParagraphs(normalized.slice(match.index + openingLength, match.index + closingOffset), true),
    });
    offset = match.index + match[0].length;
  }
  if (!content.length) return null;
  const after = normalized.slice(offset).replace(/^\n/u, "");
  if (after) content.push(...calloutParagraphs(after, false));
  return { type: "doc", content };
}

function inlineContentSlice(content: RichTextNode[], from: number, to: number): RichTextNode[] {
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

function formatCalloutNode(node: RichTextNode): RichTextNode {
  if (node.type === "codeBlock") return node;
  if (!node.content) return node;
  return { ...node, content: node.content.flatMap((child): RichTextNode[] => {
    if (child.type !== "text" || child.marks?.some((mark) => mark.type === "code")) return [formatCalloutNode(child)];
    return calloutParagraphs(child.text ?? "", true).flatMap((paragraph, index) => [
      ...(index ? [{ type: "hardBreak" } as RichTextNode] : []),
      ...(paragraph.content ?? []).map((text) => {
        const marks = [...(child.marks ?? []), ...(text.marks ?? []).filter((mark) => !child.marks?.some((existing) => existing.type === mark.type))];
        return { ...text, ...(marks.length ? { marks } : {}) };
      }),
    ]);
  }) };
}

/** Repairs literal callout tags after HTML parsing, keeping links, lists and inline marks. */
export function normalizeNotionCalloutNodes(nodes: RichTextNode[]): RichTextNode[] {
  const nested = nodes.map((node) => {
    if (!node.content || ["paragraph", "heading", "codeBlock"].includes(node.type)) return node;
    const content = normalizeNotionCalloutNodes(node.content);
    return content === node.content ? node : { ...node, content };
  });
  const input = nested.every((node, index) => node === nodes[index]) ? nodes : nested;
  const delimiters: { nodeIndex: number; from: number; to: number; closing: boolean; paired: boolean }[] = [];
  input.forEach((node, nodeIndex) => {
    if (node.type !== "paragraph" && node.type !== "heading") return;
    const text = (node.content ?? []).map((child) => {
      const value = child.type === "text" ? child.text ?? "" : "\n";
      return child.marks?.some((mark) => mark.type === "code") ? " ".repeat(value.length) : value;
    }).join("");
    for (const match of maskCalloutCode(text).matchAll(/\\?(?:<|&lt;)(\/?)aside(?:\s[^<>]*?)?(?:>|&gt;)/giu)) {
      delimiters.push({ nodeIndex, from: match.index, to: match.index + match[0].length, closing: Boolean(match[1]), paired: false });
    }
  });
  const openings: typeof delimiters = [];
  for (const delimiter of delimiters) {
    if (!delimiter.closing) openings.push(delimiter);
    else {
      const opening = openings.pop();
      if (opening) opening.paired = delimiter.paired = true;
    }
  }
  const paired = delimiters.filter((delimiter) => delimiter.paired);
  if (!paired.length) return input;

  const result: RichTextNode[] = [];
  const quotes: RichTextNode[] = [];
  function append(node: RichTextNode) {
    (quotes.at(-1)?.content ?? result).push(node);
  }
  input.forEach((node, nodeIndex) => {
    const markers = paired.filter((delimiter) => delimiter.nodeIndex === nodeIndex);
    if (!markers.length) {
      append(quotes.length ? formatCalloutNode(node) : node);
      return;
    }
    const content = node.content ?? [];
    const length = content.reduce((sum, child) => sum + (child.type === "text" ? child.text?.length ?? 0 : 1), 0);
    let offset = 0;
    function appendRange(to: number) {
      const portion = inlineContentSlice(content, offset, to);
      if (portion.length) {
        const block = { ...node, content: portion };
        append(quotes.length ? formatCalloutNode(block) : block);
      }
    }
    for (const marker of markers) {
      appendRange(marker.from);
      if (marker.closing) {
        const quote = quotes.pop();
        if (quote && !quote.content?.length) quote.content = [{ type: "paragraph" }];
      } else {
        const quote: RichTextNode = {
          type: "blockquote",
          ...(node.attrs?.blockId ? { attrs: { blockId: node.attrs.blockId } } : {}),
          content: [],
        };
        append(quote);
        quotes.push(quote);
      }
      offset = marker.to;
    }
    appendRange(length);
  });
  return result;
}

function calloutNodeElement(document: Document, node: RichTextNode): HTMLElement {
  const element = document.createElement(node.type === "blockquote" ? "blockquote" : "p");
  for (const child of node.content ?? []) {
    if (child.type !== "text") {
      element.append(calloutNodeElement(document, child));
    } else if (child.marks?.length) {
      const mark = document.createElement(child.marks[0].type === "bold" ? "strong" : "code");
      mark.textContent = child.text ?? "";
      element.append(mark);
    } else {
      element.append(document.createTextNode(child.text ?? ""));
    }
  }
  return element;
}

function firstTextNode(element: Element) {
  const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  return walker.nextNode() as Text | null;
}

function checkedFromElement(element: Element | null) {
  if (!element) return false;
  if (element instanceof HTMLInputElement) return element.checked || element.hasAttribute("checked");
  const ariaChecked = element.getAttribute("aria-checked");
  if (ariaChecked === "true") return true;
  const state = `${element.className} ${element.getAttribute("data-state") ?? ""}`;
  return /(?:checked|checkbox-on|to-do-checked|complete)/iu.test(state);
}

function removeCheckboxControl(control: Element | null) {
  if (!control) return;
  const parent = control.parentElement;
  control.remove();
  if (parent && (parent.tagName === "LABEL" || parent.tagName === "DIV") && !parent.textContent?.trim() && !parent.children.length) {
    parent.remove();
  }
}

function ensureTaskItemContent(item: HTMLLIElement) {
  const existingContent = Array.from(item.children).find((child) => child.tagName === "DIV");
  if (existingContent) return;

  const content = item.ownerDocument.createElement("div");
  const nestedLists = Array.from(item.children).filter((child) => child.matches("ul, ol"));
  const paragraph = item.ownerDocument.createElement("p");
  for (const node of Array.from(item.childNodes)) {
    if (node instanceof Element && nestedLists.includes(node)) continue;
    paragraph.append(node);
  }
  content.append(paragraph);
  for (const list of nestedLists) content.append(list);
  item.append(content);
}

/** Converts Notion callouts and to-do HTML into supported Tiptap markup before parsing. */
export function normalizeRichTextPasteHtml(html: string) {
  if (!html || typeof DOMParser === "undefined") return html;

  const document = new DOMParser().parseFromString(html, "text/html");
  let changed = false;

  for (const aside of Array.from(document.body.querySelectorAll("aside"))) {
    // Leave pasted code examples intact.
    if (aside.closest("pre, code")) continue;
    const quote = document.createElement("blockquote");
    if (!aside.children.length) {
      quote.append(...calloutParagraphs(aside.textContent ?? "", true).map((node) => calloutNodeElement(document, node)));
    } else {
      quote.append(...Array.from(aside.childNodes));
    }
    aside.replaceWith(quote);
    changed = true;
  }

  for (const list of Array.from(document.body.querySelectorAll("ul"))) {
    const items = Array.from(list.children).filter((child): child is HTMLLIElement => child instanceof HTMLLIElement);
    if (!items.length) continue;

    const listLooksLikeTasks = list.getAttribute("data-type") === "taskList"
      || /(?:to.?do|task|check)/iu.test(list.className)
      || items.some((item) => Boolean(item.querySelector(CHECKBOX_SELECTOR)))
      || items.some((item) => {
        const text = item.textContent ?? "";
        return CHECKED_TEXT_PATTERN.test(text) || UNCHECKED_TEXT_PATTERN.test(text);
      });
    if (!listLooksLikeTasks) continue;

    list.setAttribute("data-type", "taskList");
    changed = true;

    for (const item of items) {
      const checkbox = item.querySelector(CHECKBOX_SELECTOR);
      const textNode = firstTextNode(item);
      const originalText = textNode?.data ?? "";
      const checked = checkedFromElement(checkbox) || CHECKED_TEXT_PATTERN.test(originalText);

      if (textNode) {
        textNode.data = originalText.replace(CHECKED_TEXT_PATTERN, "").replace(UNCHECKED_TEXT_PATTERN, "");
      }
      removeCheckboxControl(checkbox);
      item.setAttribute("data-type", "taskItem");
      item.setAttribute("data-checked", String(checked));
      ensureTaskItemContent(item);
    }
  }

  return changed ? document.body.innerHTML : html;
}
