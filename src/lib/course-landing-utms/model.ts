export const UTM_HEADERS = ["유입 채널", "추천 코드", "진행 매체", "URL", "단축 링크"] as const;
export const MAX_UTM_ROWS = 2000;
export type LandingUtmInput = { channel: string; referral_code: string; medium: string; url: string; short_url: string };
export type LandingUtm = LandingUtmInput & { id: string };
export type UtmImportResult = { added: number; updated: number; unchanged: number };

const text = (value: unknown) => value == null ? "" : String(value).trim();
const label = (value: unknown) => text(value).normalize("NFKC").replace(/\s+/gu, " ");
const header = (value: unknown) => label(value).replace(/\s/gu, "").toLowerCase();

export function validWebUrl(value: string) {
  try {
    const url = new URL(value);
    return /^https?:\/\//iu.test(value) && !/\s/u.test(value) && !url.username && !url.password && Boolean(url.hostname);
  } catch { return false; }
}

export function parseLandingUtms(matrix: unknown[][]): LandingUtmInput[] {
  const headerIndex = matrix.findIndex(row => row.some(cell => header(cell) === "유입채널"));
  if (headerIndex < 0) throw new Error("유입 채널 열을 찾지 못했습니다.");
  const headers = matrix[headerIndex].map(header);
  const missing = UTM_HEADERS.filter(name => !headers.includes(header(name)));
  if (missing.length) throw new Error(`필수 열이 없습니다: ${missing.join(", ")}`);
  if (UTM_HEADERS.some(name => headers.filter(value => value === header(name)).length !== 1)) throw new Error("중복된 열 이름이 있습니다.");
  const positions = UTM_HEADERS.map(name => headers.indexOf(header(name)));
  const seen = new Map<string, number>();
  const rows: LandingUtmInput[] = [];
  for (let index = headerIndex + 1; index < matrix.length; index++) {
    const values = positions.map(position => matrix[index][position]);
    if (values.every(value => !text(value))) continue;
    const rowNumber = index + 1;
    const [channel, referral_code, medium] = values.slice(0, 3).map(label);
    const url = text(values[3]), short_url = text(values[4]);
    if (!channel || !medium) throw new Error(`${rowNumber}행 유입 채널과 진행 매체를 입력해 주세요.`);
    if (channel.length > 150 || medium.length > 150 || referral_code.length > 200) throw new Error(`${rowNumber}행 채널·매체는 150자, 추천 코드는 200자 이하여야 합니다.`);
    if (!validWebUrl(url) || url.length > 4000) throw new Error(`${rowNumber}행 URL은 4,000자 이하의 http 또는 https 주소여야 합니다.`);
    if (short_url && (!validWebUrl(short_url) || short_url.length > 2000)) throw new Error(`${rowNumber}행 단축 링크는 2,000자 이하의 http 또는 https 주소여야 합니다.`);
    const key = JSON.stringify([channel, referral_code, medium]);
    if (seen.has(key)) throw new Error(`${rowNumber}행은 ${seen.get(key)}행과 유입 채널·추천 코드·진행 매체가 같습니다. 한 행만 남겨 주세요.`);
    seen.set(key, rowNumber);
    rows.push({ channel, referral_code, medium, url, short_url });
    if (rows.length > MAX_UTM_ROWS) throw new Error(`한 번에 ${MAX_UTM_ROWS.toLocaleString("ko-KR")}행까지 업로드할 수 있습니다.`);
  }
  if (!rows.length) throw new Error("등록할 UTM 항목이 없습니다.");
  return rows;
}
