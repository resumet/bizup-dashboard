import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont } from "pdf-lib";

import type { CourseDocumentBlock, RichTextNode } from "@/lib/course-documents/types";
import type { InstructorContractDetail } from "./instructor-contract";

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 48;

function nodeText(node: RichTextNode): string {
  if (node.type === "hardBreak") return "\n";
  if (node.type === "horizontalRule") return "\n";
  if (node.type === "text") return node.text ?? "";
  const content = (node.content ?? []).map(nodeText).join("");
  if (["paragraph", "heading", "listItem", "tableRow", "blockquote", "callout"].includes(node.type)) return `${content}\n`;
  return content;
}

type PdfLine = { text: string; size: number; gap: number; center?: boolean; bold?: boolean };

function blockLines(block: CourseDocumentBlock): PdfLine[] {
  if (block.type === "heading1") return [{ text: block.content, size: 17, gap: 13, center: true }];
  if (block.type === "heading2") return [{ text: block.content, size: 11.5, gap: 7, bold: true }];
  if (block.type === "paragraph") return [{ text: block.content, size: 9.8, gap: 4 }];
  if (block.type === "unordered_list") return block.items.map((item) => ({ text: `• ${item}`, size: 9.8, gap: 2 }));
  if (block.type === "ordered_list") return block.items.map((item, index) => ({ text: `${index + 1}. ${item}`, size: 9.8, gap: 2 }));
  if (block.type === "image") return [{ text: `[이미지] ${block.alt}`, size: 8, gap: 4 }];
  if (block.type === "link" || block.type === "cta") return [{ text: `${block.label}: ${block.url}`, size: 8.8, gap: 4 }];
  if (block.type === "rich_text") return [{ text: nodeText(block.content).trim(), size: 9.8, gap: 4 }];
  return [];
}

function wrap(value: string, font: PDFFont, size: number, width: number) {
  const lines: string[] = [];
  for (const paragraph of value.replace(/\r\n?/gu, "\n").split("\n")) {
    if (!paragraph) { lines.push(""); continue; }
    let line = "";
    for (const char of paragraph) {
      if (line && font.widthOfTextAtSize(line + char, size) > width) {
        lines.push(line);
        line = char;
      } else line += char;
    }
    if (line) lines.push(line);
  }
  return lines;
}

type SignedContractPdfInput = Pick<InstructorContractDetail, "title" | "renderedContent" | "signingStatus" | "signatureImageData" | "signerName" | "signerMethod" | "signedAt">;

export function instructorContractPdfFilename(contract: Pick<SignedContractPdfInput, "title">) {
  return `${contract.title.replace(/[\\/:*?"<>|]/gu, "_").slice(0, 80)}_서명완료.pdf`;
}

export async function createSignedInstructorContractPdf(contract: SignedContractPdfInput) {
  if (contract.signingStatus !== "completed" || !contract.signatureImageData || !contract.signerName || !contract.signedAt) {
    throw new Error("서명이 완료된 계약서만 PDF로 만들 수 있습니다.");
  }
  const document = await PDFDocument.create();
  document.registerFontkit(fontkit);
  const fontBytes = await readFile(path.join(process.cwd(), "public", "fonts", "NanumMyeongjo-Regular.ttf"));
  const font = await document.embedFont(fontBytes);
  document.setLanguage("ko-KR");
  document.setTitle(instructorContractPdfFilename(contract).replace(/\.pdf$/u, ""));
  document.setCreator("BizUp");

  let page = document.addPage(A4);
  let y = A4[1] - MARGIN;
  const width = A4[0] - MARGIN * 2;
  const addPage = () => {
    page = document.addPage(A4);
    y = A4[1] - MARGIN;
  };
  const drawLines = (value: string, size: number, gap: number, center = false, bold = false) => {
    const lineHeight = size * 1.72;
    const lines = wrap(value, font, size, width);
    if (y - lines.length * lineHeight - gap < MARGIN) addPage();
    for (const line of lines) {
      const lineWidth = font.widthOfTextAtSize(line, size);
      page.drawText(line, { x: center ? (A4[0] - lineWidth) / 2 : MARGIN, y: y - size, font, size, color: bold ? rgb(0.05, 0.08, 0.14) : rgb(0.08, 0.12, 0.18) });
      y -= lineHeight;
    }
    y -= gap;
  };
  for (const block of contract.renderedContent) {
    for (const item of blockLines(block)) {
      if (item.text) drawLines(item.text, item.size, item.gap, item.center, item.bold);
    }
  }
  if (y < 175) addPage();
  page.drawLine({ start: { x: MARGIN, y }, end: { x: A4[0] - MARGIN, y }, thickness: 0.7, color: rgb(0.7, 0.74, 0.8) });
  y -= 22;
  drawLines("전자서명 완료", 11.5, 2, false, true);
  drawLines(`서명자: ${contract.signerName}  |  완료 일시: ${new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" }).format(new Date(contract.signedAt))}`, 8.5, 8);
  const signatureBytes = Buffer.from(contract.signatureImageData.slice(contract.signatureImageData.indexOf(",") + 1), "base64");
  const signature = await document.embedPng(signatureBytes);
  const scale = Math.min(150 / signature.width, 72 / signature.height, 1);
  page.drawImage(signature, { x: MARGIN, y: Math.max(MARGIN, y - signature.height * scale), width: signature.width * scale, height: signature.height * scale });
  page.drawText(contract.signerMethod === "seal" ? "도장" : "서명", { x: MARGIN + 160, y: Math.max(MARGIN + 12, y - 28), font, size: 8.5, color: rgb(0.25, 0.3, 0.38) });
  return new Uint8Array(await document.save());
}
