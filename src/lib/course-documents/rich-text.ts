import type { CourseDocumentBlock, RichTextNode } from "./types";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function createBlockId() {
  return crypto.randomUUID();
}

function withBlockId(node: RichTextNode, id: string): RichTextNode {
  return { ...node, attrs: { ...node.attrs, blockId: id } };
}

function textNode(text: string, marks?: RichTextNode["marks"]): RichTextNode {
  return { type: "text", text, ...(marks?.length ? { marks } : {}) };
}

function paragraph(content = ""): RichTextNode {
  return {
    type: "paragraph",
    ...(content ? { content: [textNode(content)] } : {}),
  };
}

function listNode(type: "bulletList" | "orderedList", items: string[]): RichTextNode {
  return {
    type,
    content: items.map((item) => ({
      type: "listItem",
      content: [paragraph(item)],
    })),
  };
}

export function blocksToRichTextDocument(blocks: CourseDocumentBlock[]) {
  const content = blocks.map((block): RichTextNode => {
    if (block.type === "rich_text") return withBlockId(block.content, block.id);
    if (block.type === "heading1" || block.type === "heading2") {
      return withBlockId({
        type: "heading",
        attrs: { level: block.type === "heading1" ? 1 : 2 },
        ...(block.content ? { content: [textNode(block.content)] } : {}),
      }, block.id);
    }
    if (block.type === "paragraph") return withBlockId(paragraph(block.content), block.id);
    if (block.type === "unordered_list") return withBlockId(listNode("bulletList", block.items), block.id);
    if (block.type === "ordered_list") return withBlockId(listNode("orderedList", block.items), block.id);
    if (block.type === "image") {
      return withBlockId({ type: "image", attrs: { src: block.url, alt: block.alt, title: null } }, block.id);
    }
    if (block.type === "cta") {
      return withBlockId({ type: "buttonLink", attrs: { label: block.label, url: block.url } }, block.id);
    }
    if (block.type === "link") {
      return withBlockId({
        type: "paragraph",
        content: [textNode(block.label, [{ type: "link", attrs: { href: block.url, target: "_blank", rel: "noopener noreferrer" } }])],
      }, block.id);
    }
    return withBlockId(paragraph(), block.id);
  });

  return {
    type: "doc",
    content: content.length ? content : [withBlockId(paragraph(), createBlockId())],
  };
}

function blockIdFor(node: RichTextNode, usedIds: Set<string>) {
  const candidate = node.attrs?.blockId;
  if (typeof candidate === "string" && UUID_PATTERN.test(candidate) && !usedIds.has(candidate)) {
    usedIds.add(candidate);
    return candidate;
  }
  const id = createBlockId();
  usedIds.add(id);
  return id;
}

function hasVisibleContent(node: RichTextNode): boolean {
  if (
    node.type === "image"
    || node.type === "horizontalRule"
    || node.type === "buttonLink"
    || node.type === "table"
    || node.type === "taskList"
  ) return true;
  if (node.type === "text") return Boolean(node.text?.trim());
  return Boolean(node.content?.some(hasVisibleContent));
}

export function richTextDocumentToBlocks(document: { content?: RichTextNode[] | null }) {
  const nodes = document.content ?? [];
  if (!nodes.some(hasVisibleContent)) return [];
  const usedIds = new Set<string>();
  return nodes.map<CourseDocumentBlock>((node) => {
    const id = blockIdFor(node, usedIds);
    return {
      id,
      type: "rich_text",
      content: withBlockId(node, id),
    };
  });
}

export function richTextCharacterCount(blocks: CourseDocumentBlock[]) {
  function countNode(node: RichTextNode): number {
    const ownText = node.text?.length ?? 0;
    const buttonText = node.type === "buttonLink" && typeof node.attrs?.label === "string" ? node.attrs.label.length : 0;
    return ownText + buttonText + (node.content?.reduce((sum, child) => sum + countNode(child), 0) ?? 0);
  }

  return blocks.reduce((sum, block) => {
    if (block.type === "rich_text") return sum + countNode(block.content);
    if (block.type === "heading1" || block.type === "heading2" || block.type === "paragraph") return sum + block.content.length;
    if (block.type === "unordered_list" || block.type === "ordered_list") return sum + block.items.join("").length;
    if (block.type === "link" || block.type === "cta") return sum + block.label.length;
    return sum;
  }, 0);
}
