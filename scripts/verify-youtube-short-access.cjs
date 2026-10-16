/* eslint-disable @typescript-eslint/no-require-imports -- Isolated API and database regression harness. */
const assert = require('node:assert/strict');
const { build } = require('esbuild');
const { mediaFixture } = require('./media-fixture.cjs');

(async () => {
  const fixture = await mediaFixture();
  const { db, admin, C, W } = fixture;
  try {
    const mocks = {
      'server-only': '',
      '@/lib/supabase/admin': 'exports.createAdminClient=()=>fixture.admin;',
      '@/lib/course-documents/server': 'exports.requireCourseDocumentMember=async()=>fixture.member();',
    };
    const bundle = await build({
      stdin: { resolveDir: process.cwd(), loader: 'ts', contents: `export * as route from './src/app/api/youtube-management/[courseId]/route';export {resolvePublicYoutubeShortShare} from './src/lib/youtube-management/server';` },
      bundle: true,
      write: false,
      platform: 'node',
      format: 'cjs',
      packages: 'external',
      plugins: [{ name: 'fixture', setup(plugin) { plugin.onResolve({ filter: /.*/ }, args => Object.hasOwn(mocks, args.path) ? { path: args.path, namespace: 'fixture' } : undefined); plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: mocks[args.path], loader: 'js' })); } }],
    });
    const loaded = { exports: {} };
    new Function('require', 'module', 'exports', 'fixture', bundle.outputFiles[0].text)(require, loaded, loaded.exports, { admin, member: async () => ({ admin, membership: { workspace_id: W }, user: { id: 'user' } }) });
    const { route, resolvePublicYoutubeShortShare } = loaded.exports;
    const context = { params: Promise.resolve({ courseId: C }) };
    const post = payload => route.POST(new Request(`http://fixture/api/youtube-management/${C}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }), context);
    const settings = async () => (await db.query('select * from course_youtube_settings where course_id=$1', [C])).rows[0];
    const initial = await settings();

    let response = await post({ action: 'access', kind: 'schedule', enabled: true, regenerate: false });
    assert.equal(response.status, 200);
    let body = await response.json();
    assert.equal(body.public_short_code, initial.public_short_code);
    assert.deepEqual(await resolvePublicYoutubeShortShare(`s-${initial.public_short_code}`), { kind: 'schedule', token: initial.public_token });

    response = await post({ action: 'access', kind: 'schedule', enabled: true, regenerate: true });
    assert.equal(response.status, 200);
    body = await response.json();
    assert.match(body.public_short_code, /^[A-Za-z0-9_-]{16}$/);
    assert.notEqual(body.public_short_code, initial.public_short_code);
    assert.notEqual(body.public_token, initial.public_token);
    await assert.rejects(resolvePublicYoutubeShortShare(`s-${initial.public_short_code}`), error => error.status === 404);
    assert.deepEqual(await resolvePublicYoutubeShortShare(`s-${body.public_short_code}`), { kind: 'schedule', token: body.public_token });

    response = await post({ action: 'access', kind: 'schedule', enabled: false, regenerate: false });
    assert.equal(response.status, 200);
    await assert.rejects(resolvePublicYoutubeShortShare(`s-${body.public_short_code}`), error => error.status === 404);
    assert.equal((await settings()).brief_short_code, initial.brief_short_code, 'Schedule access changes must preserve the brief short code.');
    console.log('PASS: enable preserves short URL; regeneration replaces token and short code; disabled and former codes are rejected; brief link is isolated.');
  } finally {
    await db.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
