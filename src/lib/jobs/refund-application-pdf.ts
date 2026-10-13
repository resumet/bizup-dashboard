import { PDFDocument, PDFName, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { refundApplicantSignature, refundApplicationAmount, refundApplicationFilename, refundApplicationSchema, type RefundApplicationInput } from "./refund-application";

type PdfAssets = { font: Uint8Array; template: Uint8Array };
let assetsPromise: Promise<PdfAssets> | undefined;

async function loadAsset(url: string, label: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`PDF ${label}을 불러오지 못했습니다. 다시 시도해 주세요.`);
  return new Uint8Array(await response.arrayBuffer());
}

function loadAssets() {
  assetsPromise ??= Promise.all([
    loadAsset("/fonts/NanumMyeongjo-Regular.ttf", "글꼴"),
    loadAsset("/templates/refund-application-v1.pdf", "양식"),
  ]).then(([font, template]) => ({ font, template })).catch((error) => {
    assetsPromise = undefined;
    throw error;
  });
  return assetsPromise;
}

function wrapText(value: string, font: PDFFont, size: number, width: number) {
  const lines: string[] = [];
  let line = "";
  for (const character of value) {
    if (line && font.widthOfTextAtSize(line + character, size) > width) {
      lines.push(line.trimEnd());
      line = character.trimStart();
    } else {
      line += character;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawField(page: PDFPage, font: PDFFont, label: string, value: string, x: number, top: number, width: number, height: number, align: "left" | "center" = "center") {
  for (const size of [8.04, 7.5, 7, 6.5]) {
    const lines = wrapText(value, font, size, width - 10);
    const lineHeight = size * 1.2;
    const textHeight = font.heightAtSize(size) + (lines.length - 1) * lineHeight;
    if (textHeight > height - 2) continue;
    const baseline = page.getHeight() - top - (height - textHeight) / 2 - font.heightAtSize(size, { descender: false });
    lines.forEach((line, index) => page.drawText(line, {
      x: align === "left" ? x + 5 : x + (width - font.widthOfTextAtSize(line, size)) / 2,
      y: baseline - index * lineHeight,
      size, font, color: rgb(0, 0, 0),
    }));
    return;
  }
  throw new Error(`${label}이(가) PDF 양식의 칸보다 깁니다. 내용을 줄인 뒤 다시 시도해 주세요.`);
}

export async function createRefundApplicationPdf(input: RefundApplicationInput, assets?: PdfAssets) {
  const values = refundApplicationSchema.parse(input);
  const { font, template } = assets ?? await loadAssets();
  const pdf = await PDFDocument.load(template);
  pdf.registerFontkit(fontkit);
  // Embed the complete font: subsetting this Korean font drops visible glyphs in PDF readers.
  const koreanFont = await pdf.embedFont(font);
  const page = pdf.getPage(0);
  pdf.setLanguage("ko-KR");
  pdf.setTitle(refundApplicationFilename(values).replace(/\.pdf$/u, ""));
  pdf.setCreator("Bizup");
  pdf.setAuthor("");

  // Coordinates are in points on the original Letter-sized form (612 × 792).
  drawField(page, koreanFont, "이름", values.name, 54.84, 143.4, 178.8, 21.48);
  drawField(page, koreanFont, "전화번호", values.phone, 234.12, 143.4, 162.48, 21.48);
  drawField(page, koreanFont, "이메일 주소", values.email, 397.08, 143.4, 160.56, 21.48);
  drawField(page, koreanFont, "강의명", values.courseName, 54.84, 231.84, 180.72, 21.6);
  drawField(page, koreanFont, "결제금액", `${Number(values.paymentAmount).toLocaleString("ko-KR")} 원`, 236.04, 231.84, 163.68, 21.6);
  drawField(page, koreanFont, "환불금액", `${refundApplicationAmount(values).toLocaleString("ko-KR")} 원`, 400.2, 231.84, 157.44, 21.6);

  page.drawText(`( ${values.reason} )`, { x: 116.04, y: 792 - 284, font: koreanFont, size: 8.04 });
  page.drawText("A. 개인 사정으로 인한 수강 중단", { x: 53.88, y: 792 - 307.2, font: koreanFont, size: 8.04 });
  if (values.reason === "D") {
    drawField(page, koreanFont, "기타 사유", values.reasonDetail, 103, 335.5, 455, 18, "left");
  }
  const [year, month, day] = values.date.split("-").map(Number);
  const weekday = new Intl.DateTimeFormat("ko-KR", { weekday: "short", timeZone: "UTC" })
    .format(new Date(`${values.date}T00:00:00Z`));
  const dateText = `${year} 년 ${month} 월 ${day} 일 (${weekday})`;
  const dateY = 792 - 599;
  page.drawText(dateText, { x: 380.28, y: dateY, font: koreanFont, size: 8.04 });
  page.drawLine({ start: { x: 380.28, y: dateY - 1.5 }, end: { x: 380.28 + koreanFont.widthOfTextAtSize(dateText, 8.04), y: dateY - 1.5 }, thickness: 0.36 });
  const signature = refundApplicantSignature(values.name);
  const signatureSize = [8.04, 7.5, 7, 6.5].find((size) => koreanFont.widthOfTextAtSize(signature, size) <= 178);
  if (!signatureSize) throw new Error("이름이 PDF 서명란보다 깁니다. 이름을 줄인 뒤 다시 시도해 주세요.");
  page.drawText(signature, { x: 380.28, y: 792 - 622, font: koreanFont, size: signatureSize });
  return pdf;
}

async function pdfBlob(pdf: PDFDocument) {
  return new Blob([new Uint8Array(await pdf.save())], { type: "application/pdf" });
}

export async function saveRefundApplicationPdf(input: RefundApplicationInput) {
  const pdf = await createRefundApplicationPdf(input);
  const url = URL.createObjectURL(await pdfBlob(pdf));
  const link = document.createElement("a");
  link.href = url;
  link.download = refundApplicationFilename(input);
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function printRefundApplicationPdf(input: RefundApplicationInput, popup: Window) {
  const pdf = await createRefundApplicationPdf(input);
  pdf.catalog.set(PDFName.of("OpenAction"), pdf.context.obj({ Type: "Action", S: "Named", N: "Print" }));
  const blob = await pdfBlob(pdf);
  if (popup.closed) throw new Error("출력 창이 닫혔습니다. 다시 시도해 주세요.");
  const url = URL.createObjectURL(blob);
  popup.location.replace(url);
  const timer = window.setInterval(() => {
    if (popup.closed) {
      URL.revokeObjectURL(url);
      window.clearInterval(timer);
    }
  }, 1000);
}
