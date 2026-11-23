import type { SalesDraft } from "./model";
type Card = SalesDraft["cards"][number];

export function applyCardText(text: string, fallback: Card[]) {
  if (!text.trim()) return { cards: fallback, applied: [], issues: [], notice: "" };
  const lines = text.replaceAll("**", "").split(/\r?\n/);
  const noticeIndex = lines.findIndex(line => /^(?:유의\s*사항|주의\s*사항|참고\s*사항)/.test(line.trim()));
  const notice = noticeIndex < 0 ? "" : lines.slice(noticeIndex).join("\n").trim();
  const content = noticeIndex < 0 ? lines : lines.slice(0, noticeIndex);
  const cards = new Map<string, Card>();
  const issues: string[] = [];
  let issuer = "";
  for (const original of content) {
    const line = original.trim();
    if (!line) continue;
    if (/부분\s*무이자/.test(line)) { issues.push(line); issuer = ""; continue; }
    const label = /무이자(?:\s*할부)?\s*(?:기간)?\s*[:：]?\s*/.exec(line);
    const numeric = /^(\d{1,3}(?:\s*(?:,|~|～|–|-|·)\s*\d{1,3})*)\s*개월\s*$/.exec(line);
    let period = numeric?.[1];
    if (label) {
      const name = line.slice(0, label.index).trim();
      if (name) issuer = name;
      const rest = line.slice(label.index + label[0].length);
      period = /^(\d{1,3}(?:\s*(?:,|~|～|–|-|·)\s*\d{1,3})*)\s*개월/.exec(rest)?.[1];
      if (/^(없음|미제공|불가)/.test(rest)) period = "0";
    }
    if (period !== undefined) {
      const values = period.match(/\d+/g)!.map(Number);
      if (issuer && issuer.length <= 100 && values.every(value => value <= 120)) cards.set(issuer, { issuer, interestFree: Math.max(...values) });
      else issues.push(line);
      issuer = "";
    } else if (label || /\d+\s*개월/.test(line)) { issues.push(line); issuer = ""; }
    else issuer = line;
  }
  if (cards.size > 60) issues.push("카드사는 최대 60개까지 입력할 수 있습니다.");
  const rows = [...cards.values()].slice(0, 60);
  return { cards: rows, applied: rows.map(card => card.issuer), issues, notice };
}
