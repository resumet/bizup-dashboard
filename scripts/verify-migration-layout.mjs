import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => readFileSync(resolve(root, name), "utf8");
const digest = (text) => createHash("sha256").update(text.replaceAll("\r\n", "\n")).digest("hex");
const baseline = JSON.parse(read("supabase/baseline-manifest.json"));
const archiveRoot = "supabase/migrations_archive/20260929";
const archive = JSON.parse(read(`${archiveRoot}/manifest.json`));
const active = readdirSync(resolve(root, "supabase/migrations")).filter((name) => name.endsWith(".sql")).sort();
assert(active.includes(baseline.file), "The production baseline is missing");
assert.equal(digest(read(`supabase/migrations/${baseline.file}`)), baseline.sha256, "Do not edit the recorded baseline; create a new migration");
const versions = new Set();
for (const name of active) {
  const match = /^(\d{12}|\d{14})_.+\.sql$/.exec(name);
  assert(match, `Invalid migration filename: ${name}`);
  assert(!versions.has(match[1]), `Duplicate migration version: ${match[1]}`);
  versions.add(match[1]);
  assert(name === baseline.file || match[1] > baseline.version, `Historical SQL must stay archived: ${name}`);
}
assert.equal(archive.files.length, 91, "Historical archive is incomplete");
assert.equal(readdirSync(resolve(root, archiveRoot)).filter((name) => name.endsWith(".sql")).length, 91);
for (const item of archive.files) {
  assert.equal(digest(read(`${archiveRoot}/${item.file}`)), item.sha256Normalized, `Historical SQL changed: ${item.file}`);
}
console.log(`Migration layout verified: ${active.length} active file(s), 91 unchanged archived files, unique versions.`);
