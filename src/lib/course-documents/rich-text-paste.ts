import type { RichTextNode } from "./types";
import { createCallout, decodeCalloutEntities, inlineNodeText, leadingCalloutIcon } from "./callout";
import { calloutMarkdownBlocks, calloutMarkdownInline } from "./callout-markdown";

const CHECKBOX_SELECTOR = [
  'input[type="checkbox"]',
  '[role="checkbox"]',
  '[class*="checkbox" i]',
  '[class*="to-do" i]',
].join(",");

const CHECKED_TEXT_PATTERN = /^\s*(?:☑|✅|✔|✓|\[x\])\s*/iu;
const UNCHECKED_TEXT_PATTERN = /^\s*(?:☐|□|\[\s\])\s*/u;

function calloutParagraphs(text: string, markdown: boolean): RichTextNode[] {
  if (markdown) return calloutMarkdownBlocks(text);
  return text.replace(/^\n|\n$/gu, "").split("\n").map((line) => ({
    type: "paragraph", ...(line ? { content: [{ type: "text", text: line }] } : {}),
  }));
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
    content.push(createCallout(calloutMarkdownBlocks(normalized.slice(match.index + openingLength, match.index + closingOffset))));
    offset = match.index + match[0].length;
  }
  if (!content.length) return null;
  const after = normalized.slice(offset).replace(/^\n/u, "");
  if (after) content.push(...calloutParagraphs(after, false));
  return { type: "doc", content };
}

function formatCalloutNode(node: RichTextNode): RichTextNode {
  if (node.type === "codeBlock") return node;
  if (!node.content) return node;
  if (node.type !== "paragraph" && node.type !== "heading") return { ...node, content: formatCalloutBlocks(node.content) };
  return { ...node, content: node.content.flatMap((child): RichTextNode[] => {
    if (child.type !== "text" || child.marks?.some((mark) => mark.type === "code")) return [formatCalloutNode(child)];
    return calloutMarkdownInline(decodeCalloutEntities(child.text ?? "").replace(/\\[ \t]*(?=\n|$)/gu, ""), child.marks);
  }) };
}

function formatCalloutBlocks(nodes: RichTextNode[]): RichTextNode[] {
  const result: RichTextNode[] = [];
  let plain: RichTextNode[] = [];
  function flush() {
    if (plain.length) {
      const source = plain.map(inlineNodeText).join("\n\n");
      const blockMarkdown = /^ {0,3}(?:[-*+]\s|\d+[.)]\s|#{1,6}\s|`{3,}|~{3,}|>\s)/mu.test(source);
      result.push(...(blockMarkdown ? calloutMarkdownBlocks(source) : plain.map(formatCalloutNode)));
    }
    plain = [];
  }
  for (const node of nodes) {
    if (node.type === "paragraph" && node.content?.every((child) => (child.type === "text" && !child.marks?.length) || child.type === "hardBreak")) {
      plain.push(node);
    } else {
      flush();
      result.push(formatCalloutNode(node));
    }
  }
  flush();
  while (result[0]?.type === "paragraph" && !inlineNodeText(result[0]).trim()) result.shift();
  while (result.at(-1)?.type === "paragraph" && !inlineNodeText(result.at(-1)!).trim()) result.pop();
  return result;
}

type IndexedNode = { node: RichTextNode; from: number; to: number; rootIndex: number; children?: IndexedNode[] };

function equalNodeValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length
      && left.every((value, index) => equalNodeValue(value, right[index]));
  }
  const keys = Object.keys(left);
  const other = right as Record<string, unknown>;
  return keys.length === Object.keys(right).length
    && keys.every((key) => Object.hasOwn(other, key) && equalNodeValue((left as Record<string, unknown>)[key], other[key]));
}

/** Tags may end inside a list item, so index the entire tree rather than sibling paragraphs. */
export function normalizeNotionCalloutNodes(nodes: RichTextNode[]): RichTextNode[] {
  let source = "";
  function indexNode(node: RichTextNode, rootIndex: number, code = false): IndexedNode {
    const from = source.length;
    const protectedCode = code || node.type === "codeBlock" || Boolean(node.marks?.some((mark) => mark.type === "code"));
    let children: IndexedNode[] | undefined;
    if (node.type === "text") source += protectedCode ? " ".repeat(node.text?.length ?? 0) : node.text ?? "";
    else if (node.type === "hardBreak") source += "\n";
    else if (node.content?.length) {
      source += "\n";
      children = node.content.map((child) => indexNode(child, rootIndex, protectedCode));
      source += "\n";
    } else source += "\uFFFC";
    return { node, from, to: source.length, rootIndex, children };
  }
  const tree = nodes.map((node, index) => indexNode(node, index));
  function extract(items: IndexedNode[], from: number, to: number): RichTextNode[] {
    return items.flatMap((item): RichTextNode[] => {
      if (item.to <= from || item.from >= to) return [];
      if (from <= item.from && to >= item.to) return [item.node];
      if (item.node.type === "text") {
        const text = item.node.text?.slice(Math.max(0, from - item.from), Math.min(item.to, to) - item.from);
        return text ? [{ ...item.node, text }] : [];
      }
      if (!item.children) return [item.node];
      const content = extract(item.children, from, to);
      return content.length ? [{ ...item.node, content }] : [];
    });
  }
  type Marker = { from: number; to: number };
  const openings: Marker[] = [];
  const pairs: { opening: Marker; closing: Marker }[] = [];
  for (const match of maskCalloutCode(source).matchAll(/\\?(?:<|&lt;)(\/?)aside(?:\s[^<>]*?)?(?:>|&gt;)/giu)) {
    const marker = { from: match.index, to: match.index + match[0].length };
    if (!match[1]) openings.push(marker);
    else {
      const opening = openings.pop();
      if (opening) pairs.push({ opening, closing: marker });
    }
  }
  pairs.sort((a, b) => a.opening.from - b.opening.from);
  function range(from: number, to: number): RichTextNode[] {
    const result: RichTextNode[] = [];
    let cursor = from;
    for (const pair of pairs) {
      if (pair.opening.from < cursor || pair.closing.to > to) continue;
      result.push(...extract(tree, cursor, pair.opening.from));
      const original = tree.find((item) => item.from <= pair.opening.from && item.to >= pair.opening.to)?.node;
      const attrs = original?.attrs?.blockId ? { blockId: original.attrs.blockId } : undefined;
      result.push(createCallout(formatCalloutBlocks(range(pair.opening.to, pair.closing.from)), attrs));
      cursor = pair.closing.to;
    }
    result.push(...extract(tree, cursor, to));
    return result;
  }
  const input = pairs.length ? range(0, source.length) : nodes;
  const normalized = input.map((node) => {
    if (!node.content || ["paragraph", "heading", "codeBlock"].includes(node.type)) return node;
    const content = normalizeNotionCalloutNodes(node.content);
    const legacy = node.type === "blockquote" && content[0]?.type === "paragraph" && leadingCalloutIcon(inlineNodeText(content[0]));
    const next = node.type === "callout" || legacy
      ? createCallout(formatCalloutBlocks(content), node.attrs)
      : content === node.content ? node : { ...node, content };
    return equalNodeValue(next, node) ? node : next;
  });
  return normalized.every((node, index) => node === nodes[index]) && normalized.length === nodes.length ? nodes : normalized;
}

function calloutNodeElement(document: Document, node: RichTextNode): HTMLElement {
  const tags: Partial<Record<RichTextNode["type"], string>> = {
    paragraph: "p", bulletList: "ul", orderedList: "ol", listItem: "li", taskList: "ul", taskItem: "li",
    blockquote: "blockquote", codeBlock: "pre", hardBreak: "br", horizontalRule: "hr",
    table: "table", tableRow: "tr", tableHeader: "th", tableCell: "td",
  };
  const element = document.createElement(node.type === "heading" ? `h${node.attrs?.level ?? 2}` : tags[node.type] ?? "p");
  if (node.type === "taskList") element.setAttribute("data-type", "taskList");
  if (node.type === "taskItem") {
    element.setAttribute("data-type", "taskItem");
    element.setAttribute("data-checked", String(node.attrs?.checked ?? false));
  }
  for (const child of node.content ?? []) {
    if (child.type !== "text") {
      element.append(calloutNodeElement(document, child));
    } else {
      let text: Node = document.createTextNode(child.text ?? "");
      for (const mark of child.marks ?? []) {
        const tag = ({ bold: "strong", italic: "em", strike: "s", code: "code", link: "a" } as Record<string, string>)[mark.type];
        if (!tag) continue;
        const wrapper = document.createElement(tag);
        if (mark.type === "link" && typeof mark.attrs?.href === "string") wrapper.setAttribute("href", mark.attrs.href);
        wrapper.append(text);
        text = wrapper;
      }
      element.append(text);
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

  for (const aside of Array.from(document.body.querySelectorAll('aside, figure.callout, .notion-callout-block, [data-block-type="callout"]'))) {
    // Leave pasted code examples intact.
    if (aside.closest("pre, code")) continue;
    const quote = document.createElement("div");
    quote.setAttribute("data-course-document-callout", "");
    quote.setAttribute("data-icon", "");
    const body = document.createElement("div");
    body.setAttribute("data-callout-content", "");
    if (!aside.children.length) {
      body.append(...calloutMarkdownBlocks(aside.textContent ?? "").map((node) => calloutNodeElement(document, node)));
    } else {
      body.append(...Array.from(aside.childNodes));
    }
    quote.append(body);
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
