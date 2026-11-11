import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont } from "pdf-lib";

import type { CourseDocumentBlock, RichTextNode } from "@/lib/course-documents/types";
import { COMPANY_CONTRACT_DETAILS, type InstructorContractDetail } from "./instructor-contract";

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 48;
const COMPANY_SEAL_SIZE = 42;

function nodeText(node: RichTextNode): string {
  if (node.type === "hardBreak" || node.type === "horizontalRule") return "\n";
  if (node.type === "text") return node.text ?? "";
  const content = (node.content ?? []).map(nodeText).join("");
  if (["paragraph", "heading", "listItem", "tableRow", "blockquote", "callout"].includes(node.type)) return content + "\n";
  return content;
}

type PdfLine = { text: string; size: number; gap: number; center?: boolean; bold?: boolean };

function blockLines(block: CourseDocumentBlock): PdfLine[] {
  if (block.type === "heading1") return [{ text: block.content, size: 17, gap: 13, center: true, bold: true }];
  if (block.type === "heading2") return [{ text: block.content, size: 11.5, gap: 7, bold: true }];
  if (block.type === "paragraph") return [{ text: block.content, size: 9.8, gap: 4 }];
  if (block.type === "unordered_list") return block.items.map((item) => ({ text: "• " + item, size: 9.8, gap: 2 }));
  if (block.type === "ordered_list") return block.items.map((item, index) => ({ text: String(index + 1) + ". " + item, size: 9.8, gap: 2 }));
  if (block.type === "image") return [{ text: "[이미지] " + block.alt, size: 8, gap: 4 }];
  if (block.type === "link" || block.type === "cta") return [{ text: block.label + ": " + block.url, size: 8.8, gap: 4 }];
  if (block.type === "rich_text") return [{ text: nodeText(block.content).trim(), size: 9.8, gap: 4 }];
  return [];
}

function wrap(value: string, font: PDFFont, size: number, width: number) {
  const lines: string[] = [];
  for (const paragraph of value.replace(/\r\n?/gu, "\n").split("\n")) {
    if (!paragraph) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const char of paragraph) {
      if (line && font.widthOfTextAtSize(line + char, size) > width) {
        lines.push(line);
        line = char;
      } else {
        line += char;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

type ContractPdfInput = Pick<InstructorContractDetail, "title" | "renderedContent">;

function filenameSegment(value: string, fallback: string) {
  return value.trim().replace(/[\\/:*?"<>|]/gu, "_").replace(/\s+/gu, " ").slice(0, 80) || fallback;
}

export function instructorContractPdfFilename(contract: Pick<InstructorContractDetail, "values">) {
  const { values } = contract;
  const contractDate = filenameSegment(values.contractDate, "계약일자미입력");
  return [
    filenameSegment(values.instructorName, "강사명미입력"),
    filenameSegment(values.lectureName, "강의명미입력"),
    contractDate,
  ].join("-") + ".pdf";
}

export async function createInstructorContractPdf(contract: ContractPdfInput) {
  const document = await PDFDocument.create();
  document.registerFontkit(fontkit);

  const [fontBytes, companySealBytes] = await Promise.all([
    readFile(path.join(process.cwd(), "public", "fonts", "NanumMyeongjo-Regular.ttf")),
    readFile(path.join(process.cwd(), "public", "images", "bizup-corporate-seal.png")),
  ]);
  const [font, companySeal] = await Promise.all([
    document.embedFont(fontBytes),
    document.embedPng(companySealBytes),
  ]);

  document.setLanguage("ko-KR");
  document.setTitle(contract.title.replace(/[\\/:*?"<>|]/gu, "_").slice(0, 80));
  document.setCreator("BizUp");

  let page = document.addPage(A4);
  let y = A4[1] - MARGIN;
  const width = A4[0] - MARGIN * 2;
  const pageHasContent = [false];

  const addPage = () => {
    page = document.addPage(A4);
    y = A4[1] - MARGIN;
    pageHasContent.push(false);
  };

  const drawCompanySeal = (line: string, x: number, size: number) => {
    const sealIndex = line.indexOf("(인)");
    if (
      sealIndex < 0
      || !line.includes("대표이사")
      || !line.includes(COMPANY_CONTRACT_DETAILS.representative)
    ) return;

    const sealX = x + font.widthOfTextAtSize(line.slice(0, sealIndex), size) - 3;
    page.drawImage(companySeal, {
      x: sealX,
      y: y - size - ((COMPANY_SEAL_SIZE - size) / 2),
      width: COMPANY_SEAL_SIZE,
      height: COMPANY_SEAL_SIZE,
      opacity: 0.94,
    });
  };

  const drawLines = (value: string, size: number, gap: number, center = false, bold = false) => {
    const lineHeight = size * 1.72;
    const lines = wrap(value, font, size, width);
    if (y - lines.length * lineHeight - gap < MARGIN) addPage();

    for (const line of lines) {
      const lineWidth = font.widthOfTextAtSize(line, size);
      const x = center ? (A4[0] - lineWidth) / 2 : MARGIN;
      page.drawText(line, {
        x,
        y: y - size,
        font,
        size,
        color: bold ? rgb(0.05, 0.08, 0.14) : rgb(0.08, 0.12, 0.18),
      });
      pageHasContent[pageHasContent.length - 1] = true;
      drawCompanySeal(line, x, size);
      y -= lineHeight;
    }
    y -= gap;
  };

  for (const block of contract.renderedContent) {
    for (const item of blockLines(block)) {
      if (item.text) drawLines(item.text, item.size, item.gap, item.center, item.bold);
    }
  }

  if (pageHasContent.length > 1 && !pageHasContent.at(-1)) {
    document.removePage(pageHasContent.length - 1);
  }

  const pages = document.getPages();
  pages.forEach((currentPage, index) => {
    const pageNumber = `${index + 1} / ${pages.length}`;
    const size = 8;
    const pageWidth = currentPage.getWidth();
    currentPage.drawText(pageNumber, {
      x: (pageWidth - font.widthOfTextAtSize(pageNumber, size)) / 2,
      y: 22,
      font,
      size,
      color: rgb(0.35, 0.39, 0.45),
    });
  });

  return new Uint8Array(await document.save());
}

