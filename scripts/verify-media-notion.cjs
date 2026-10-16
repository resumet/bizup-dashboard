/* eslint-disable @typescript-eslint/no-require-imports */
const assert=require('node:assert/strict');const {build}=require('esbuild');
(async()=>{
 const result=await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:`export * from './src/lib/youtube-management/notion';export * from './src/lib/youtube-management/model';`},bundle:true,write:false,platform:'node',format:'cjs',packages:'external',plugins:[{name:'mock',setup(p){p.onResolve({filter:/^(server-only|\.\/server)$/},a=>({path:a.path,namespace:'mock'}));p.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:a.path==='server-only'?'':'exports.MediaError=class extends Error {constructor(message,status){super(message);this.status=status}};',loader:'js'}));}}]});
 const loaded={exports:{}};new Function('require','module','exports',result.outputFiles[0].text)(require,loaded,loaded.exports);const lib=loaded.exports;
 process.env.NOTION_CONNECTION_ENCRYPTION_KEY='fixture-only-encryption-key';const secret='fixture-notion-token-do-not-use';const encrypted=lib.encryptNotionToken(secret,'workspace-one');assert.ok(!encrypted.includes(secret));assert.equal(lib.decryptNotionToken(encrypted,'workspace-one'),secret);assert.throws(()=>lib.decryptNotionToken(encrypted,'workspace-two'));
 const brief=lib.briefSchema.parse({topic:'테스트 강의',basicInfo:'강사 이름'});assert.equal(Object.keys(brief).length,14);assert.equal(lib.briefSchema.safeParse({topic:'a'.repeat(8001)}).success,false);
 assert.equal(lib.appearanceSchema.safeParse({...lib.emptyAppearance(),channel_name:'채널',channel_url:'javascript:alert(1)'}).success,false);
 assert.equal(lib.publicAppearanceSchema.safeParse({...lib.emptyAppearance(),id:'00000000-0000-4000-8000-000000000001',filming_confirmed:true}).success,false);
 const full=lib.briefSchema.parse(Object.fromEntries(lib.BRIEF_FIELDS.map(f=>[f.key,'가'.repeat(8000)])));assert.ok(lib.notionBlocks(full).length<=100);
 const calls=[];const originalFetch=global.fetch;global.fetch=async(url,options)=>{calls.push({url,options});return Response.json({id:'00000000-0000-4000-8000-000000000001',url:'https://www.notion.so/test',public_url:null});};
 try{
 const course={name:'강의',instructor_name:'김선아',cohort:'1기'};const parent={id:lib.DEFAULT_NOTION_PARENT,kind:'data_source',titleProperty:'강사명'};
 await lib.exportNotion(secret,parent,course,brief);assert.equal(calls.length,1);const create=JSON.parse(calls[0].options.body);assert.equal(create.parent.data_source_id,lib.DEFAULT_NOTION_PARENT);assert.ok(create.properties['강사명'].title[0].text.content.includes('김선아'));assert.ok(create.children.some(b=>b.heading_2?.rich_text[0].text.content==='7. 기타 전달하고 싶은 내용'));assert.ok(!calls[0].options.body.includes(secret));
 calls.length=0;await lib.exportNotion(secret,parent,course,brief,'00000000-0000-4000-8000-000000000001');assert.equal(calls.length,2);assert.equal(calls[0].options.method,'PATCH');assert.equal(JSON.parse(calls[0].options.body).type,'replace_content');assert.ok(calls.every(c=>c.url.includes('/pages/00000000-0000-4000-8000-000000000001')));
 global.fetch=async()=>Response.json({message:'invalid token '+secret},{status:401});await assert.rejects(lib.notionRequest(secret,'pages/test'),error=>error.message.includes('토큰')&&!error.message.includes(secret));
 }finally{global.fetch=originalFetch;delete process.env.NOTION_CONNECTION_ENCRYPTION_KEY;}
 console.log('PASS: proposal schema and seven-section Notion output; token encryption/workspace binding; page creation/update contracts; safe failure messages.');
})().catch(error=>{console.error(error);process.exitCode=1;});
