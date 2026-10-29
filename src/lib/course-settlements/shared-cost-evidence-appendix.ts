import type { CourseCost } from "@/lib/course-costs/types";
import { escapePrintHtml } from "./print";

const currency = (value: number) => `${Math.round(value).toLocaleString("ko-KR")}원`;

function evidenceContent(file: CourseCost["attachments"][number]) {
  const name = escapePrintHtml(file.originalName);
  if (!file.url) return `<div class="evidence-unavailable"><strong>${name}</strong><span>파일을 불러올 수 없습니다.</span></div>`;
  const url = escapePrintHtml(file.url);
  if (file.mimeType.startsWith("image/")) {
    return `<img class="evidence-image" src="${url}" alt="${name}" />`;
  }
  if (file.mimeType === "application/pdf") {
    return `<object class="evidence-pdf" data="${url}" type="application/pdf"><div class="evidence-unavailable"><strong>${name}</strong><a href="${url}" target="_blank" rel="noreferrer">PDF 파일 열기</a></div></object><p class="evidence-link"><a href="${url}" target="_blank" rel="noreferrer">${name} 열기</a></p>`;
  }
  return `<div class="evidence-unavailable"><strong>${name}</strong><a href="${url}" target="_blank" rel="noreferrer">첨부파일 열기</a></div>`;
}

export function sharedCostEvidenceAppendixHtml(costs: CourseCost[]) {
  const evidence = costs
    .filter((cost) => cost.burdenType === "SHARED")
    .flatMap((cost) => cost.attachments.map((file) => ({ cost, file })));
  if (!evidence.length) return "";

  const items = evidence.map(({ cost, file }) => {
    const title = `${cost.name}(${cost.managerName || "-"}) - ${currency(cost.grossAmount)}`;
    return `<article class="shared-evidence-item"><h3>${escapePrintHtml(title)}</h3><p class="evidence-file-name">${escapePrintHtml(file.originalName)}</p>${evidenceContent(file)}</article>`;
  }).join("");

  return `<style>
section.shared-cost-evidence{break-before:page;break-inside:auto}
.shared-cost-evidence>h2{margin-top:0}
.shared-evidence-item{break-inside:avoid}
.shared-evidence-item+.shared-evidence-item{break-before:page}
.shared-evidence-item h3{margin:0 0 4px;font-size:14px}
.evidence-file-name{margin:0 0 10px;color:#667085;overflow-wrap:anywhere}
.evidence-image{display:block;width:auto;max-width:100%;height:auto;max-height:225mm;margin:0 auto;object-fit:contain}
.evidence-pdf{display:block;width:100%;height:225mm;border:1px solid #dbe0e8;background:#f8fafc}
.evidence-link{margin:8px 0 0;text-align:right}
.evidence-link a,.evidence-unavailable a{color:#1d4ed8;text-decoration:underline}
.evidence-unavailable{display:flex;min-height:72px;flex-direction:column;align-items:center;justify-content:center;gap:5px;border:1px dashed #cbd5e1;background:#f8fafc;color:#475467;text-align:center}
</style><section class="shared-cost-evidence"><h2>회사·강사 공동 부담 첨부파일</h2>${items}</section>`;
}
