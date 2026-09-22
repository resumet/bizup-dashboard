import type { CourseCost } from "@/lib/course-costs/types";
import { escapePrintHtml, printHtmlDocument } from "./print";

type EvidenceCost = Pick<CourseCost, "name" | "attachments">;

export function evidenceFormat(name: string, mimeType: string) {
  if (mimeType === "application/pdf" || /\.pdf$/iu.test(name)) return "pdf";
  if (/^image\/(jpeg|png|gif|webp|bmp)$/iu.test(mimeType) || /\.(jpe?g|png|gif|webp|bmp)$/iu.test(name)) return "image";
  return "unsupported";
}

export function evidencePage(costName: string, fileName: string, imageUrl?: string, page?: number) {
  const heading = `${escapePrintHtml(costName)} · ${escapePrintHtml(fileName)}${page ? ` · ${page}페이지` : ""}`;
  return `<section class="evidence-page"><h2>첨부 증빙</h2><h3>${heading}</h3>${imageUrl
    ? `<img src="${escapePrintHtml(imageUrl)}" alt="${heading}">`
    : '<p>이 파일 형식은 이미지 출력이 지원되지 않습니다. 비용 관리에서 원본 첨부파일을 확인해 주세요.</p>'}</section>`;
}

export async function waitForPrintImages(document: Document) {
  await Promise.all(Array.from(document.images, (img) => img.decode()));
  await document.fonts.ready;
}

export async function printStatementWithEvidence(title: string, body: string, costs: EvidenceCost[]) {
  // Open during the click event, before fetching files, to avoid popup blockers.
  const popup = printHtmlDocument(title, "<p>증빙서류를 준비하고 있습니다...</p>", undefined, false);
  const objectUrls: string[] = [];
  try {
    let appendix = "";
    for (const cost of costs) {
      for (const file of cost.attachments) {
        const format = evidenceFormat(file.originalName, file.mimeType);
        if (format === "unsupported") {
          appendix += evidencePage(cost.name, file.originalName);
          continue;
        }
        try {
          if (!file.url) throw new Error("다운로드 주소 없음");
          const response = await fetch(file.url, { signal: AbortSignal.timeout(60_000) });
          if (!response.ok) throw new Error("다운로드 실패");
          const blob = await response.blob();
          if (format === "image") {
            const url = URL.createObjectURL(blob);
            objectUrls.push(url);
            appendix += evidencePage(cost.name, file.originalName, url);
          } else {
            const pdfjs = await import("pdfjs-dist");
            pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
            const task = pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) });
            task.onPassword = () => { void task.destroy(); };
            try {
              const pdf = await task.promise;
              for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
                if (popup.closed) throw new Error("인쇄 창 닫힘");
                const page = await pdf.getPage(pageNumber);
                const original = page.getViewport({ scale: 1 });
                const viewport = page.getViewport({ scale: Math.min(2, 2400 / Math.max(original.width, original.height)) });
                const canvas = document.createElement("canvas");
                canvas.width = Math.ceil(viewport.width);
                canvas.height = Math.ceil(viewport.height);
                await page.render({ canvas, viewport }).promise;
                appendix += evidencePage(cost.name, file.originalName, canvas.toDataURL("image/png"), pageNumber);
                canvas.width = canvas.height = 0;
                page.cleanup();
              }
            } finally {
              await task.destroy();
            }
          }
        } catch {
          throw new Error(`증빙 '${file.originalName}'을 불러오지 못했습니다. 화면을 새로고침한 후 다시 시도해 주세요. 암호화된 PDF는 암호를 해제해 등록해 주세요.`);
        }
      }
    }
    if (popup.closed) throw new Error("인쇄 창이 닫혔습니다. 다시 시도해 주세요.");
    const styles = '<style>.evidence-page{break-before:page;break-inside:avoid}.evidence-page h2{margin-top:0}.evidence-page h3{overflow-wrap:anywhere;max-height:25mm;overflow:hidden}.evidence-page img{display:block;width:100%;height:225mm;object-fit:contain;object-position:top center}</style>';
    printHtmlDocument(title, body + styles + appendix, popup, false);
    await waitForPrintImages(popup.document);
    popup.focus();
    popup.print();
  } catch (error) {
    popup.close();
    throw error;
  } finally {
    objectUrls.forEach((url) => URL.revokeObjectURL(url));
  }
}
