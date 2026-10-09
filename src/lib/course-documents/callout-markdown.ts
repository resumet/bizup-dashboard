import { Lexer, type MarkedToken, type Token, type Tokens } from "marked";

import { decodeCalloutEntities } from "./callout";
import type { RichTextMark, RichTextNode } from "./types";

const OPTIONS = { gfm: true, breaks: true };

function safeUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function inlineTokens(tokens: Token[], marks: RichTextMark[] = []): RichTextNode[] {
  return tokens.flatMap((value): RichTextNode[] => {
    const token = value as MarkedToken;
    if (token.type === "br") return [{ type: "hardBreak" }];
    if (token.type === "strong" || token.type === "em" || token.type === "del") {
      const type = token.type === "strong" ? "bold" : token.type === "em" ? "italic" : "strike";
      return inlineTokens(token.tokens, [...marks.filter((mark) => mark.type !== type), { type }]);
    }
    if (token.type === "link") {
      const href = safeUrl(decodeCalloutEntities(token.href));
      return inlineTokens(token.tokens, href ? [...marks, { type: "link", attrs: { href, target: "_blank", rel: "noopener noreferrer" } }] : marks);
    }
    if (token.type === "text" && token.tokens) return inlineTokens(token.tokens, marks);
    if (token.type === "codespan") return [{ type: "text", text: token.text, marks: [...marks, { type: "code" }] }];
    const text = "text" in token ? decodeCalloutEntities(token.text) : token.raw;
    return text ? [{ type: "text", text, ...(marks.length ? { marks } : {}) }] : [];
  });
}

export function calloutMarkdownInline(text: string, marks: RichTextMark[] = []) {
  return inlineTokens(Lexer.lexInline(text, OPTIONS), marks);
}

function blockTokens(tokens: Token[]): RichTextNode[] {
  return tokens.flatMap((value): RichTextNode[] => {
    const token = value as MarkedToken;
    if (token.type === "space" || token.type === "def") return [];
    if (token.type === "heading") return [{ type: "heading", attrs: { level: Math.min(3, token.depth) }, content: inlineTokens(token.tokens) }];
    if (token.type === "blockquote") return [{ type: "blockquote", content: blockTokens(token.tokens) }];
    if (token.type === "code") return [{ type: "codeBlock", content: token.text ? [{ type: "text", text: token.text }] : [] }];
    if (token.type === "hr") return [{ type: "horizontalRule" }];
    if (token.type === "list") {
      const tasks = token.items.every((item) => item.task);
      return [{
        type: tasks ? "taskList" : token.ordered ? "orderedList" : "bulletList",
        ...(token.ordered ? { attrs: { start: token.start || 1 } } : {}),
        content: token.items.map((item): RichTextNode => ({
          type: tasks ? "taskItem" : "listItem",
          ...(tasks ? { attrs: { checked: item.checked ?? false } } : {}),
          content: blockTokens(item.tokens),
        })),
      }];
    }
    if (token.type === "table") {
      const row = (cells: Tokens.TableCell[], header: boolean): RichTextNode => ({
        type: "tableRow",
        content: cells.map((cell) => ({ type: header ? "tableHeader" : "tableCell", content: [{ type: "paragraph", content: inlineTokens(cell.tokens) }] })),
      });
      return [{ type: "table", content: [row(token.header, true), ...token.rows.map((cells) => row(cells, false))] }];
    }
    if (token.type === "paragraph" || token.type === "text") {
      return [{ type: "paragraph", content: token.tokens ? inlineTokens(token.tokens) : calloutMarkdownInline(token.text) }];
    }
    // Raw HTML remains text; clipboard markup never becomes executable content.
    return [{ type: "paragraph", content: [{ type: "text", text: token.raw }] }];
  });
}

export function calloutMarkdownBlocks(text: string) {
  const source = decodeCalloutEntities(text).replace(/\r\n?/gu, "\n").replace(/\\[ \t]*(?=\n|$)/gu, "").trim();
  return blockTokens(Lexer.lex(source, OPTIONS));
}
