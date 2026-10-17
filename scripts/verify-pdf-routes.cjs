/* eslint-disable @typescript-eslint/no-require-imports -- Route integration harness, following verify-instagram-share.cjs. */
const assert = require("node:assert/strict");
const { build } = require("esbuild");

(async () => {
  const documentId = "00000000-0000-4000-8000-000000000001";
  const otherId = "00000000-0000-4000-8000-000000000002";
  const courseId = "00000000-0000-4000-8000-000000000003";
  const workspaceId = "00000000-0000-4000-8000-000000000004";
  const block1 = "00000000-0000-4000-8000-000000000005";
  const block2 = "00000000-0000-4000-8000-000000000006";
  const token = "a".repeat(48);
  const fixture = { loggedIn: false, enabled: true, cookies: new Map(), removed: [], files: [] };
  const tables = {
    course_documents: [
      { id: documentId, course_id: courseId, workspace_id: workspaceId, deleted_at: null, status: "draft", content: [] },
      { id: otherId, course_id: otherId, workspace_id: otherId, deleted_at: null, status: "draft", content: [] },
    ],
    course_instagram_materials: [{ document_id: documentId, course_id: courseId, position: 1 }],
    course_document_pdf_imports: [],
  };
  const admin = {
    from(table) {
      let filters = [], operation, payload, single = false, count = false, limit = Infinity;
      const query = {
        select(_columns, options) { count = options?.count === "exact"; return query; },
        eq(key, value) { filters.push(row => row[key] === value); return query; },
        is(key, value) { return query.eq(key, value); },
        gte(key, value) { filters.push(row => row[key] >= value); return query; },
        order() { return query; }, limit(value) { limit = value; return query; },
        insert(value) { operation = "insert"; payload = value; return query; },
        update(value) { operation = "update"; payload = value; return query; },
        delete() { operation = "delete"; return query; },
        maybeSingle() { single = true; return query; },
        then(resolve, reject) {
          return Promise.resolve().then(() => {
            const rows = tables[table].filter(row => filters.every(filter => filter(row))).slice(0, limit);
            if (operation === "insert") {
              const row = { status: "uploaded", stage: "업로드", progress: 0, result: null, attempts: 0, retries: 0, created_at: new Date().toISOString(), ...payload };
              tables[table].push(row);
            }
            if (operation === "update") for (const row of rows) Object.assign(row, payload);
            if (operation === "delete") tables[table] = tables[table].filter(row => !rows.includes(row));
            return { data: single ? rows[0] ?? null : rows, error: null, ...(count ? { count: rows.length } : {}) };
          }).then(resolve, reject);
        },
      };
      return query;
    },
    storage: { from(bucket) {
      assert.equal(bucket, "course-document-pdfs");
      return {
        async createSignedUploadUrl(path) { return { data: { signedUrl: "https://storage.test/upload/" + path }, error: null }; },
        async createSignedUrl(path, seconds) { assert.equal(seconds, 600); return { data: { signedUrl: "https://storage.test/source/" + path }, error: null }; },
        async download() { return { data: new Blob(["png"], { type: "image/png" }), error: null }; },
        async list() { return { data: fixture.files.map(name => ({ name })), error: null }; },
        async remove(paths) { fixture.removed.push(...paths); return { error: null }; },
      };
    } },
  };
  fixture.admin = admin;
  fixture.member = () => {
    if (!fixture.loggedIn) throw new Error("UNAUTHORIZED");
    return { admin, membership: { workspace_id: workspaceId } };
  };
  fixture.external = value => {
    if (value !== token) throw new Error("NOT_FOUND");
    if (!fixture.enabled) throw new Error("EXTERNAL_DISABLED");
    return { admin, course: { id: courseId }, settings: { workspace_id: workspaceId } };
  };
  const mocks = {
    "workflow/api": "exports.start=async()=>({runId:'test-run'});",
    "@/workflows/pdf-conversion": "exports.pdfConversionWorkflow=async()=>{};",
    "server-only": "",
    "@/lib/supabase/admin": "exports.createAdminClient=()=>fixture.admin;",
    "next/headers": "exports.cookies=async()=>({get:name=>fixture.cookies.has(name)?{value:fixture.cookies.get(name)}:undefined});",
    "@/lib/course-documents/server": `exports.requireCourseDocumentMember=async()=>fixture.member();exports.getExternalCourse=async token=>fixture.external(token);exports.unlockCookieName=id=>'unlock_'+id;exports.verifyUnlockToken=value=>value==='valid';exports.courseDocumentErrorResponse=error=>Response.json({message:error.message},{status:error.message==='UNAUTHORIZED'?401:error.message==='NOT_FOUND'?404:error.message==='EXTERNAL_DISABLED'?403:400});`,
    "./server": `exports.requireCourseDocumentMember=async()=>fixture.member();exports.getExternalCourse=async token=>fixture.external(token);`,
  };
  const bundle = await build({ stdin: { resolveDir: process.cwd(), loader: "ts", contents: `export * as api from './src/app/api/course-document-pdfs/route';export * as assets from './src/app/api/course-document-pdfs/assets/[jobId]/[asset]/route';` }, bundle: true, write: false, platform: "node", format: "cjs", packages: "external", plugins: [{ name: "fixture", setup(plugin) {
    plugin.onResolve({ filter: /.*/ }, args => Object.hasOwn(mocks, args.path) ? { path: args.path, namespace: "fixture" } : undefined);
    plugin.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: mocks[args.path], loader: "js" }));
  } }] });
  const loaded = { exports: {} };
  new Function("require", "module", "exports", "fixture", bundle.outputFiles[0].text)(require, loaded, loaded.exports, fixture);
  const { api, assets } = loaded.exports;
  const request = (method, body, accessToken = token) => new Request("https://app.test/api/course-document-pdfs", { method, headers: { "Content-Type": "application/json", ...(accessToken ? { "x-course-access-token": accessToken } : {}) }, body: JSON.stringify(body) });
  const get = (id = documentId, accessToken = token) => api.GET(new Request("https://app.test/api/course-document-pdfs?documentId=" + id, { headers: accessToken ? { "x-course-access-token": accessToken } : {} }));
  assert.equal((await get(documentId, "")).status, 401);
  assert.equal((await get(otherId)).status, 404);
  fixture.enabled = false;
  assert.equal((await get()).status, 403);
  fixture.enabled = true;
  fixture.loggedIn = true;
  assert.equal((await get(otherId, "")).status, 404);
  fixture.loggedIn = false;
  const payload = { documentId, fileName: "guide.pdf", fileSize: 100, mime: "application/pdf", sha256: "a".repeat(64), options: { mode: "structure", images: true, ocr: false } };
  assert.equal((await api.POST(request("POST", { ...payload, mime: "text/html" }))).status, 400);
  const created = await api.POST(request("POST", payload));
  assert.equal(created.status, 201);
  const { id: jobId, uploadUrl } = await created.json();
  assert(uploadUrl.includes(workspaceId));
  assert.equal((await api.POST(request("POST", payload))).status, 409);
  await api.PATCH(request("PATCH", { documentId, id: jobId, action: "queue" }));
  const job = tables.course_document_pdf_imports[0];
  assert.equal(job.status, "queued");
  await api.PATCH(request("PATCH", { documentId, id: jobId, action: "queue" }));
  assert.equal(job.attempts, 0);
  assert.equal((await api.PATCH(request("PATCH", { documentId: otherId, id: jobId, action: "source" }))).status, 404);
  const url = await (await api.PATCH(request("PATCH", { documentId, id: jobId, action: "source" }))).json();
  assert(url.url.includes("source.pdf"));
  job.status = "failed";
  job.retries = 3;
  assert.equal((await api.PATCH(request("PATCH", { documentId, id: jobId, action: "retry" }))).status, 429);
  const assetUrl = `https://app.test/api/course-document-pdfs/assets/${jobId}/p1-0.png`;
  const assetArgs = { params: Promise.resolve({ jobId, asset: "p1-0.png" }) };
  const asset = () => assets.GET(new Request(assetUrl), assetArgs);
  assert.equal((await asset()).status, 404);
  fixture.cookies.set(`pdf_course_${documentId}`, token);
  assert.equal((await asset()).status, 200);
  fixture.enabled = false;
  assert.equal((await asset()).status, 404);
  fixture.enabled = true;
  fixture.cookies.clear();
  const doc = tables.course_documents[0];
  doc.status = "published";
  doc.lead_gate_enabled = true;
  doc.lead_gate_after_block_id = block1;
  doc.content = [{ id: block1, type: "paragraph", content: "public" }, { id: block2, type: "rich_text", content: { type: "image", attrs: { src: assetUrl, sourceJobId: jobId } } }];
  assert.equal((await asset()).status, 404);
  fixture.cookies.set("unlock_" + documentId, "valid");
  assert.equal((await asset()).status, 200);
  assert.equal((await api.DELETE(request("DELETE", { documentId, id: jobId }))).status, 409);
  doc.content = [];
  fixture.files = ["source.pdf", "ir.json", "p1-0.png"];
  assert.equal((await api.DELETE(request("DELETE", { documentId, id: jobId }))).status, 200);
  assert.equal(fixture.removed.length, 3);
  assert.equal(tables.course_document_pdf_imports.length, 0);
  console.log("PDF routes: authorization, cross-course denial, signed upload/source, duplicate detection, idempotent queue, retry cap, private/gated assets, complete deletion passed.");
})().catch(error => { console.error(error); process.exitCode = 1; });
