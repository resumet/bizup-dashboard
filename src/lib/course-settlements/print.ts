export function escapePrintHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/gu, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
  })[character] ?? character);
}

export function printHtmlDocument(title: string, body: string) {
  const popup = window.open("", "_blank");
  if (!popup) throw new Error("인쇄 창을 열 수 없습니다. 이 사이트의 팝업을 허용해 주세요.");
  popup.opener = null;
  popup.document.open();
  popup.document.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${escapePrintHtml(title)}</title><style>@page{size:A4;margin:14mm}*{box-sizing:border-box}body{font-family:Pretendard,"Noto Sans KR",Arial,sans-serif;color:#18181b;font-size:11px;line-height:1.5}h1{font-size:23px;margin:0 0 8px}h2{margin:24px 0 8px;font-size:16px}h3{margin:16px 0 6px;font-size:13px}.meta{color:#52525b;margin-bottom:16px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.card{border:1px solid #d4d4d8;border-radius:8px;padding:10px;break-inside:avoid}.label{color:#71717a;font-size:10px}.value{font-size:14px;font-weight:700;margin-top:3px}table{width:100%;border-collapse:collapse;margin:8px 0 14px}th,td{border:1px solid #d4d4d8;padding:6px;text-align:left;vertical-align:top}th{background:#f4f4f5}.number{text-align:right;white-space:nowrap}.total{font-weight:700;background:#f0fdf4}.warning{color:#b91c1c}section,tr,.card{break-inside:avoid}</style></head><body>${body}</body></html>`);
  popup.document.close();
  popup.focus();
  popup.setTimeout(() => popup.print(), 250);
}
