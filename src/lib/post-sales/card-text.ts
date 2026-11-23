import { cardIssuers, type SalesDraft } from "./model";

type Card = SalesDraft["cards"][number];
type Periods = Partial<Pick<Card, "interestFree" | "installment">>;
const aliases: Record<string, Card["issuer"]> = { KB국민: "국민", KB: "국민", NH농협: "농협", NH: "농협", BC: "비씨" };
const issuerPattern = new RegExp(`(${[...Object.keys(aliases), ...cardIssuers].join("|")})(?:\\s*카드)?`, "gi");

function months(text: string) {
  if (/^(?:없음|미제공|불가|해당\s*없음)/.test(text.trim())) return 0;
  const match = /^\s*(\d{1,3}(?:\s*(?:~|～|–|-|,|·|개월\s*~)\s*\d{1,3})*)\s*개월/.exec(text);
  if (!match) return undefined;
  const values = match[1].match(/\d+/g)!.map(Number);
  return values.every(value => value <= 120) ? Math.max(...values) : undefined;
}

export function parseCardText(text: string) {
  const updates = new Map<Card["issuer"], Periods>();
  const issues: string[] = [];
  let activeIssuers: Card["issuer"][] = [];
  for (const original of text.normalize("NFKC").split(/\r?\n/)) {
    const line = original.replaceAll("**", "").trim();
    if (!line) continue;
    if (/^(?:유의\s*사항|주의\s*사항|참고\s*사항)/.test(line)) break;
    const matches = [...line.matchAll(issuerPattern)];
    if (matches.length) activeIssuers = [...new Set(matches.map(match => aliases[match[1].toUpperCase()] ?? match[1] as Card["issuer"]))];
    if (!activeIssuers.length) continue;
    // 부분 무이자 조건은 완전 무이자 기간으로 오인하지 않는다.
    const labels = [...line.matchAll(/(부분\s*무이자(?:\s*할부)?|무이자(?:\s*할부)?|최대\s*(?:할부)?|일반\s*할부|할부)\s*(?:기간)?\s*[:：]?\s*/g)];
    const values: Periods = {};
    if (!labels.length && /^\d[\d\s,~～–·-]*개월\s*$/.test(line)) {
      const value = months(line);
      if (value !== undefined) values.interestFree = value;
    }
    for (const [index, label] of labels.entries()) {
      if (label[1].startsWith("부분")) continue;
      const value = months(line.slice(label.index! + label[0].length, labels[index + 1]?.index));
      if (value !== undefined) values[label[1].startsWith("무이자") ? "interestFree" : "installment"] = value;
    }
    if (!Object.keys(values).length) {
      if (/\d+\s*개월/.test(line)) issues.push(line);
      continue;
    }
    for (const issuer of activeIssuers) updates.set(issuer, { ...updates.get(issuer), ...values });
  }
  return { updates, issues };
}

export function applyCardText(text: string, cards: Card[]) {
  const { updates, issues } = parseCardText(text);
  const applied: string[] = [];
  const rejected: string[] = [];
  const next = cards.map(card => {
    const update = updates.get(card.issuer);
    if (!update) return card;
    const result = { ...card, ...update };
    if (result.interestFree > result.installment) { rejected.push(card.issuer); return card; }
    applied.push(card.issuer);
    return result;
  });
  return { cards: next, applied, rejected, issues };
}
