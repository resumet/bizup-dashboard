import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { deflateSync } from "node:zlib";

function loadLocalEnvironment() {
  const contents = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  for (const line of contents.split(/\r?\n/u)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/u);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim();
  }
}

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer) {
  const name = Buffer.from(type);
  const output = Buffer.alloc(data.length + 12);
  output.writeUInt32BE(data.length, 0);
  name.copy(output, 4);
  data.copy(output, 8);
  output.writeUInt32BE(crc32(Buffer.concat([name, data])), data.length + 8);
  return output;
}

function makeReferencePng() {
  const width = 256;
  const height = 256;
  const rows: Buffer[] = [];
  for (let y = 0; y < height; y += 1) {
    const row = Buffer.alloc(1 + width * 3);
    for (let x = 0; x < width; x += 1) {
      const offset = 1 + x * 3;
      const accent = x > 24 && x < 232 && y > 160 && y < 210;
      row[offset] = accent ? 250 : 15;
      row[offset + 1] = accent ? 204 : 23;
      row[offset + 2] = accent ? 21 : 42;
    }
    rows.push(row);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

async function main() {
  loadLocalEnvironment();
  const [{ createEmptyAdProject }, { analyzeReferenceImages }] = await Promise.all([
    import("../src/lib/kakao-ad-maker/types"),
    import("../src/lib/kakao-ad-maker/server"),
  ]);
  const project = createEmptyAdProject();
  project.mood = "강렬함";
  project.assets = [{
    id: crypto.randomUUID(),
    type: "reference",
    name: "synthetic-reference.png",
    mimeType: "image/png",
    dataUrl: `data:image/png;base64,${makeReferencePng().toString("base64")}`,
    isPrimary: false,
    purpose: "색감",
    importance: "높음",
    memo: "검은 배경과 노란 강조 영역만 참고",
    enabled: true,
  }];
  const profile = await analyzeReferenceImages(project);
  const cached = await analyzeReferenceImages({ ...project, styleProfile: profile });
  console.log(JSON.stringify({
    hasSummary: profile.summary.length > 0,
    colors: profile.backgroundColors.length + profile.accentColors.length,
    cached: cached.inputHash === profile.inputHash,
    excludedElements: profile.excludedElements.length,
  }));
}

void main();
