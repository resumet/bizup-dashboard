/* eslint-disable @typescript-eslint/no-require-imports -- Isolated public metadata and image route regression harness. */
const assert = require('node:assert/strict');
const { build } = require('esbuild');

(async () => {
  const scheduleToken = 'a'.repeat(48), briefToken = 'b'.repeat(48), courseId = '00000000-0000-4000-8000-000000000001';
  const course = { id: courseId, workspace_id: 'workspace', name: '수익화 강의', instructor_name: '홍길동', cohort: '1', free_webinar_at: null, banner_image_path: 'workspace/banner.png', updated_at: '2026-10-16T00:00:00Z' };
  const setting = { course_id: courseId, workspace_id: 'workspace', public_token: scheduleToken, public_enabled: true, brief_token: briefToken, brief_enabled: true, brief: {}, brief_revision: 0 };
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9kAAAAASUVORK5CYII=', 'base64');
  let downloads = 0;
  const admin = {
    from(table) {
      const filters = [];
      const query = {
        select() { return query; },
        eq(key, value) { filters.push([key, value]); return query; },
        maybeSingle() { return Promise.resolve(result()); },
        single() { return Promise.resolve(result()); },
      };
      function result() {
        const source = table === 'course_youtube_settings' ? setting : table === 'courses' ? course : null;
        const matches = source && filters.every(([key, value]) => source[key] === value);
        return { data: matches ? structuredClone(source) : null, error: null };
      }
      return query;
    },
    storage: { from(bucket) { assert.equal(bucket, 'course-banners'); return { async download(path) { assert.equal(path, course.banner_image_path); downloads += 1; return { data: new Blob([png], { type: 'image/png' }), error: null }; } }; } },
  };
  const mocks = {
    'server-only': '',
    '@/lib/supabase/admin': 'exports.createAdminClient=()=>fixture.admin;',
    '@/lib/course-documents/server': 'exports.requireCourseDocumentMember=async()=>{};',
    '@/lib/course-landing-utms/server': 'exports.loadLandingUtms=async()=>[];',
    '@/components/youtube-management/public-workspace': 'exports.PublicYoutubeWorkspace=()=>null;',
  };
  const bundle = await build({
    stdin: { resolveDir: process.cwd(), loader: 'ts', contents: `export * as page from './src/app/public/youtube/[kind]/[token]/page';export * as imageRoute from './src/app/public/youtube/[kind]/[token]/share-image/route';export { publicMedia } from './src/lib/youtube-management/server';` },
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    packages: 'external',
    jsx: 'automatic',
    plugins: [{ name: 'fixture', setup(plugin) { plugin.onResolve({ filter: /.*/ }, args => Object.hasOwn(mocks, args.path) ? { path: args.path, namespace: 'fixture' } : undefined); plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: mocks[args.path], loader: 'js' })); } }],
  });
  const loaded = { exports: {} };
  new Function('require', 'module', 'exports', 'fixture', bundle.outputFiles[0].text)(require, loaded, loaded.exports, { admin });
  const { page, imageRoute, publicMedia } = loaded.exports;
  const args = (kind, token) => ({ params: Promise.resolve({ kind, token }) });

  for (const [kind, token] of [['schedule', scheduleToken], ['brief', briefToken]]) {
    const metadata = await page.generateMetadata(args(kind, token));
    assert.deepEqual(metadata.title, { absolute: '홍길동-수익화 강의-1기' });
    assert.equal(metadata.openGraph.title, metadata.title.absolute);
    assert.equal(metadata.openGraph.url, `https://bizup-dashboard.vercel.app/public/youtube/${kind}/${token}`);
    assert.equal(metadata.twitter.card, 'summary_large_image');
    assert.ok(metadata.openGraph.images[0].url.startsWith('https://'));
    assert.ok(metadata.openGraph.images[0].url.includes(`/${kind}/${token}/share-image`));
    assert.ok(!JSON.stringify(metadata).includes(course.banner_image_path));
    const image = await imageRoute.GET(new Request('http://fixture'), args(kind, token));
    assert.equal(image.status, 200);
    assert.equal(image.headers.get('content-type'), 'image/png');
    assert.deepEqual(Buffer.from(await image.arrayBuffer()), png);
  }

  const publicBrief = await publicMedia(briefToken, 'brief');
  assert.equal(publicBrief.course.banner_image_path, undefined);
  assert.equal(publicBrief.course.updated_at, undefined);

  setting.public_enabled = false;
  const disabledMetadata = await page.generateMetadata(args('schedule', scheduleToken));
  assert.deepEqual(disabledMetadata.title, { absolute: '유튜브 출연 관리' });
  assert.deepEqual(disabledMetadata.openGraph.images, []);
  assert.equal((await imageRoute.GET(new Request('http://fixture'), args('schedule', scheduleToken))).status, 404);
  assert.equal((await imageRoute.GET(new Request('http://fixture'), args('schedule', 'invalid'))).status, 404);
  assert.equal(downloads, 2, 'Disabled and invalid shares must not read private storage.');

  course.banner_image_path = null;
  assert.equal((await page.generateMetadata(args('brief', briefToken))).twitter.card, 'summary');
  assert.equal((await imageRoute.GET(new Request('http://fixture'), args('brief', briefToken))).status, 404);
  console.log('PASS: YouTube public pages expose exact course metadata and original banner bytes; private paths stay hidden; disabled, invalid and absent-image shares are blocked.');
})().catch(error => { console.error(error); process.exitCode = 1; });
