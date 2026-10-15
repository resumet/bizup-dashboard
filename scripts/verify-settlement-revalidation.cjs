/* eslint-disable @typescript-eslint/no-require-imports -- Isolated route regression harness. */
const assert = require('node:assert/strict');
const { build } = require('esbuild');

async function loadRoute(name, fixture) {
  const mocks = {
    '@/lib/supabase/server': 'exports.createClient = async () => ({});',
    '@/lib/supabase/auth': 'exports.getAuthenticatedUser = async () => fixture.user;',
    '@/lib/course-settlements/server': `exports.authorizeSettlement = async () => ({admin: fixture.admin, workspaceId: 'workspace', settlement: fixture.project, role: 'admin'});
      exports.loadSettlementState = async (_, project) => project;
      exports.settlementError = error => Response.json({message: error.message}, {status: 400});`,
    '@/lib/course-costs/server': 'exports.loadCourseCosts = async () => []; exports.filterSettlementCosts = costs => costs;',
    '@/lib/admin/access': 'exports.hasAdminAccess = () => true;',
  };
  const result = await build({ entryPoints: [`src/app/api/course-settlements/[settlementId]/${name}/route.ts`], bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external', plugins: [{ name: 'fixtures', setup(plugin) {
    plugin.onResolve({ filter: /^@\/lib\// }, args => mocks[args.path] ? { path: args.path, namespace: 'fixture' } : undefined);
    plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: mocks[args.path], loader: 'js' }));
  } }] });
  const loaded = { exports: {} };
  new Function('require', 'module', 'exports', 'fixture', result.outputFiles[0].text)(require, loaded, loaded.exports, fixture);
  return loaded.exports;
}

(async () => {
  const numeric = ['totalSales', 'tossSales', 'pgFee', 'cashPayments', 'cashCancellations', 'cashSales', 'settlementBase', 'systemNovaFee', 'additionalServiceFee', 'settlementAmount', 'finalSettlement', 'tossMatchCount', 'cashMatchCount', 'serviceMatchCount'];
  const row = { ...Object.fromEntries(numeric.map(key => [key, 0])), instructor: '강사', tossSales: 100000, totalSales: 100000, finalSettlement: 100000 };
  const month = { inputOrder: 0, fileName: 'saved.xlsx', periodYear: 2026, periodMonth: 10, periodLabel: '2026-10', totals: row, instructorResults: [row], comparisons: [], detailsByInstructor: {} };
  const fixture = { user: { id: 'user' }, project: { id: 'settlement', course_id: 'course', latest_version: 4, analysis_snapshot: null, statement_draft: { lectureName: '강의', coursePeriod: '', settlementPeriod: '', manager: '' } }, uploads: [{ is_active: true, analysis_snapshot: month }, { is_active: false, analysis_snapshot: { ...month, totals: { ...row, totalSales: 999999 } } }], versions: [] };
  fixture.admin = { from(table) {
    let patch;
    const response = () => {
      if (table === 'courses') return { data: { id: 'course', name: '강의', instructor_name: '강사' }, error: null };
      if (table === 'course_settlement_uploads') return { data: fixture.uploads, error: null };
      if (table === 'course_settlement_projects') { Object.assign(fixture.project, patch); return { data: fixture.project, error: null }; }
      return { data: null, error: null };
    };
    const query = { select() { return query; }, eq() { return query; }, update(value) { patch = value; return query; }, insert(value) { if (table === 'course_settlement_versions') fixture.versions.push(value); return query; }, maybeSingle: async () => response(), single: async () => response(), then(resolve, reject) { return Promise.resolve(response()).then(resolve, reject); } };
    return query;
  } };
  const uploads = await loadRoute('uploads', fixture);
  const context = { params: Promise.resolve({ settlementId: 'settlement' }) };
  const request = () => new Request('https://example.test/uploads', { method: 'POST', body: new FormData() });
  const response = await uploads.POST(request(), context);
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal(fixture.project.analysis_snapshot.totals.totalSales, 100000);
  assert.equal(fixture.project.latest_version, 5);
  assert.equal(fixture.versions.length, 1);
  assert.match(fixture.versions[0].reason, /재검증/);
  const confirm = await loadRoute('confirm', fixture);
  const confirmed = await confirm.POST(new Request('https://example.test/confirm', { method: 'POST' }), context);
  assert.equal(confirmed.status, 200, await confirmed.clone().text());
  assert.equal(fixture.project.status, '정산확정');
  assert.equal(fixture.project.statement_draft.manager, '');
  fixture.uploads = [];
  assert.equal((await uploads.POST(request(), context)).status, 400);
  fixture.user = null;
  assert.equal((await uploads.POST(request(), context)).status, 401);
  assert.equal((await confirm.POST(request(), context)).status, 401);
  console.log('PASS: existing active workbook revalidation, inactive exclusion, version saved, optional fields confirmation, no-file rejection, authentication');
})().catch(error => { console.error(error); process.exitCode = 1; });
