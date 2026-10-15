/* eslint-disable @typescript-eslint/no-require-imports -- Read-only HTTP verification against existing enabled shares. */
const assert = require('node:assert/strict');
const { createClient } = require('@supabase/supabase-js');
process.loadEnvFile('.env.local');
const base = process.env.SHARE_VERIFY_BASE_URL;
if(!base)throw new Error('Set SHARE_VERIFY_BASE_URL to the server being verified.');
const decode = text => text.replace(/&#x([\da-f]+);/gi,(_,code)=>String.fromCodePoint(parseInt(code,16))).replace(/&#(\d+);/g,(_,code)=>String.fromCodePoint(Number(code))).replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
function tags(html){
  const head=html.split('</head>')[0],result={};
  for(const tag of head.matchAll(/<meta\b[^>]*>/g)){
    const attrs=Object.fromEntries([...tag[0].matchAll(/([:\w-]+)="([^"]*)"/g)].map(([,key,value])=>[key,decode(value)]));
    if(attrs.property||attrs.name)result[attrs.property||attrs.name]=attrs.content;
  }
  return result;
}
(async()=>{
  const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const [writers,articles]=await Promise.all([
    admin.from('course_document_settings').select('external_access_token,courses!inner(name,instructor_name,banner_image_path,updated_at)').eq('external_edit_enabled',true).not('courses.banner_image_path','is',null).limit(1),
    admin.from('course_documents').select('slug,courses!inner(name,instructor_name,banner_image_path,updated_at)').eq('status','published').is('deleted_at',null).not('courses.banner_image_path','is',null).limit(1),
  ]);
  assert.ifError(writers.error);assert.ifError(articles.error);
  const samples=[...(writers.data??[]).map(row=>({kind:'writer',path:`/write/${row.external_access_token}?preview=instagram`,course:row.courses})),...(articles.data??[]).map(row=>({kind:'article',path:`/article/${row.slug}`,course:row.courses}))];
  assert.ok(samples.length,'No enabled share with a course banner is available to verify.');
  for(const sample of samples){
    const course=Array.isArray(sample.course)?sample.course[0]:sample.course;
    const response=await fetch(new URL(sample.path,base),{headers:{'User-Agent':'KakaoTalk/1.0'}});assert.equal(response.status,200);
    const html=await response.text(),meta=tags(html),title=`${course.instructor_name?.trim()||'강사'}-${course.name.trim()}-인스타컨텐츠`;
    assert.equal(meta['og:title'],title);assert.equal(meta['twitter:title'],title);assert.equal(meta['twitter:card'],'summary_large_image');
    assert.equal(meta['og:description'],`${course.instructor_name?.trim()||'강사'} 강사님의 ${course.name.trim()} 인스타그램 콘텐츠입니다.`);
    const imageUrl=new URL(meta['og:image']);assert.equal(imageUrl.protocol,'https:');assert.equal(imageUrl.searchParams.get('v'),course.updated_at);
    const image=await fetch(new URL(imageUrl.pathname+imageUrl.search,base),{headers:{'User-Agent':'KakaoTalk/1.0'}});assert.equal(image.status,200);assert.match(image.headers.get('content-type'),/^image\//);
    const original=await admin.storage.from('course-banners').download(course.banner_image_path);assert.ifError(original.error);assert.ok(original.data);
    const bytes=Buffer.from(await image.arrayBuffer());assert.deepEqual(bytes,Buffer.from(await original.data.arrayBuffer()));
    console.log(`PASS: ${sample.kind} Kakao crawler receives course title/description in head and original banner (${bytes.length} bytes), without login.`);
  }
  const invalid=await fetch(new URL('/write/invalid/share-image',base));assert.equal(invalid.status,404);
  console.log(`Verified ${samples.length} existing share(s); invalid token blocked; no data changed.`);
})().catch(error=>{console.error(error.message);process.exitCode=1;});
