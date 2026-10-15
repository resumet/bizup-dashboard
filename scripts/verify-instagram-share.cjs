/* eslint-disable @typescript-eslint/no-require-imports -- Isolated metadata/image route regression harness. */
const assert = require('node:assert/strict');
const { build } = require('esbuild');

(async () => {
  const token='a'.repeat(48), replacement='b'.repeat(48), courseId='00000000-0000-4000-8000-000000000001';
  const course={id:courseId,workspace_id:'workspace',name:'수익화 강의',instructor_name:'홍길동',cohort:'1',banner_image_path:'workspace/banner.png',updated_at:'2026-10-15T00:00:00Z'};
  const setting={course_id:courseId,workspace_id:'workspace',external_access_token:token,external_edit_enabled:true};
  const document={id:'document',slug:'public-example',course_id:courseId,status:'published',deleted_at:null,content:[{content:'비공개 본문은 메타데이터에 포함하지 않음'}]};
  let downloads=0;
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9kAAAAASUVORK5CYII=','base64');
  const admin={from(table){
    let filters=[];
    const query={select(){return query;},eq(key,value){filters.push([key,value]);return query;},is(key,value){filters.push([key,value]);return query;},async maybeSingle(){
      const source=table==='course_document_settings'?setting:table==='courses'?course:{...document,courses:course};
      return {data:filters.every(([key,value])=>source[key]===value)?structuredClone(source):null,error:null};
    }};return query;
  },storage:{from(bucket){assert.equal(bucket,'course-banners');return {async download(path){assert.equal(path,course.banner_image_path);downloads++;return {data:new Blob([png],{type:'image/png'}),error:null};}};}}};
  const mocks={'server-only':'','@/lib/supabase/admin':'exports.createAdminClient=()=>fixture.admin;','@/lib/course-operations/server':'exports.requireCourseOperationsMembership=()=>{};exports.requireCourseOperationsUser=()=>{};'};
  const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:`export * as writer from './src/app/write/[accessToken]/layout';export * as article from './src/app/article/[slug]/page';export * as writerImage from './src/app/write/[accessToken]/share-image/route';export * as articleImage from './src/app/article/[slug]/share-image/route';`},bundle:true,write:false,platform:'node',format:'cjs',packages:'external',jsx:'automatic',plugins:[{name:'fixture',setup(p){p.onResolve({filter:/.*/},a=>Object.hasOwn(mocks,a.path)?{path:a.path,namespace:'fixture'}:undefined);p.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:mocks[a.path],loader:'js'}));}}]});
  const loaded={exports:{}};new Function('require','module','exports','fixture',bundle.outputFiles[0].text)(require,loaded,loaded.exports,{admin});
  const {writer,article,writerImage,articleImage}=loaded.exports;
  const writerArgs=value=>({params:Promise.resolve({accessToken:value})});const articleArgs={params:Promise.resolve({slug:'public-example'})};
  for(const metadata of [await writer.generateMetadata(writerArgs(token)),await article.generateMetadata(articleArgs)]){
    assert.deepEqual(metadata.title,{absolute:'홍길동-수익화 강의-인스타컨텐츠'});
    assert.equal(metadata.openGraph.title,metadata.title.absolute);assert.equal(metadata.twitter.card,'summary_large_image');
    assert.ok(metadata.openGraph.images[0].url.startsWith('https://'));assert.ok(!JSON.stringify(metadata).includes('비공개 본문'));
  }
  for(const response of [await writerImage.GET(new Request('http://fixture'),writerArgs(token)),await articleImage.GET(new Request('http://fixture'),articleArgs)]){
    assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/png');assert.equal(response.headers.get('content-disposition'),'inline');assert.equal(response.headers.get('cache-control'),'no-store');assert.deepEqual(Buffer.from(await response.arrayBuffer()),png);
  }
  setting.external_edit_enabled=false;
  assert.equal((await writer.generateMetadata(writerArgs(token))).openGraph.images.length,0);
  assert.equal((await writerImage.GET(new Request('http://fixture'),writerArgs(token))).status,404);
  setting.external_edit_enabled=true;setting.external_access_token=replacement;
  assert.equal((await writerImage.GET(new Request('http://fixture'),writerArgs(token))).status,404);
  assert.equal((await writerImage.GET(new Request('http://fixture'),writerArgs('invalid'))).status,404);
  for(const patch of [{status:'draft',deleted_at:null},{status:'published',deleted_at:'2026-10-15T00:00:00Z'}]){
    Object.assign(document,patch);assert.equal((await article.generateMetadata(articleArgs)).openGraph.images.length,0);assert.equal((await articleImage.GET(new Request('http://fixture'),articleArgs)).status,404);
  }
  assert.equal(downloads,2,'Revoked, draft and deleted shares must not read storage');
  course.banner_image_path=null;
  assert.equal((await writer.generateMetadata(writerArgs(replacement))).twitter.card,'summary');assert.equal((await writerImage.GET(new Request('http://fixture'),writerArgs(replacement))).status,404);
  console.log('PASS: external writer and published article metadata; original banner bytes/type; revoked/disabled/invalid tokens, draft/deleted articles and absent banners are blocked; gated content excluded.');
})().catch(error=>{console.error(error);process.exitCode=1;});
