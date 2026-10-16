/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require('node:fs/promises');
const {PGlite}=require('@electric-sql/pglite');
const W='00000000-0000-4000-8000-000000000001',W2='00000000-0000-4000-8000-000000000002';
const C='00000000-0000-4000-8000-000000000021',C2='00000000-0000-4000-8000-000000000022';
async function mediaFixture(){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema extensions;create function extensions.gen_random_bytes(n integer) returns bytea language sql as $$select decode(substr(replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''),1,n*2),'hex')$$;
 create table workspaces(id uuid primary key);insert into workspaces values('${W}'),('${W2}');
 create table courses(id uuid primary key,workspace_id uuid references workspaces(id),name text,instructor_name text,cohort text,status text,free_webinar_at timestamptz,created_at timestamptz default now());
 create table course_document_settings(course_id uuid primary key references courses(id) on delete restrict,workspace_id uuid references workspaces(id),external_edit_enabled boolean default false,external_access_token text default encode(extensions.gen_random_bytes(24),'hex'));
 create table course_youtube_appearances(id uuid primary key default gen_random_uuid(),course_id uuid references courses(id) on delete cascade,channel_name text not null,channel_url text not null,video_url text default '',landing_utm text default '',sort_order smallint default 0,created_at timestamptz default now());
 create table course_landing_utms(id uuid primary key default gen_random_uuid(),course_id uuid references courses(id) on delete cascade,channel text,referral_code text,medium text,url text,short_url text);
 create table youtube_analyzed_channels(workspace_id uuid,channel jsonb,position integer);
 create table course_options(id uuid primary key default gen_random_uuid(),course_id uuid,name text,list_price integer,sale_price integer,group_chat_link text,entry_code text,sort_order integer);
 create table course_live_videos(id uuid primary key default gen_random_uuid(),course_id uuid,name text,video_url text,note text,sort_order integer);
 insert into courses values('${C}','${W}','검증 강의','김선아','1기','active',now(),now());
 grant usage on schema extensions to service_role;grant all on all tables in schema public to service_role;`);
 const name=(await fs.readdir('supabase/migrations')).find(name=>name.endsWith('_course_media_management.sql'));
 await db.exec(await fs.readFile(`supabase/migrations/${name}`,'utf8'));
 await db.exec(`insert into courses values('${C2}','${W2}','다른 강의','다른 강사','2기','completed',now(),now());`);
 const admin={from(table){
  let columns='*',conditions=[],orders=[],limit,offset,operation='select',values,single=false;
  const q={select(value='*'){columns=value;return q;},eq(key,value){conditions.push([key,value,'=']);return q;},is(key,value){conditions.push([key,value,'is']);return q;},in(key,value){conditions.push([key,value,'in']);return q;},order(key,options){orders.push(`${key} ${options?.ascending===false?'desc':'asc'}`);return q;},limit(value){limit=value;return q;},range(start,end){offset=start;limit=end-start+1;return q;},maybeSingle(){single=true;return q;},single(){single=true;return q;},insert(value){operation='insert';values=Array.isArray(value)?value:[value];return q;},update(value){operation='update';values=value;return q;},delete(){operation='delete';return q;},
  then(resolve,reject){const params=[];const bind=value=>{params.push(value);return '$'+params.length;};let sql;
   if(operation==='insert'){const keys=Object.keys(values[0]);sql=`insert into ${table}(${keys.join(',')}) values ${values.map(row=>'('+keys.map(key=>bind(row[key])).join(',')+')').join(',')}`;}
   else if(operation==='update')sql=`update ${table} set ${Object.entries(values).map(([key,value])=>`${key}=${bind(typeof value==='object'&&value!==null?JSON.stringify(value):value)}`).join(',')}`;
   else sql=operation==='delete'?`delete from ${table}`:`select ${columns} from ${table}`;
   if(conditions.length)sql+=' where '+conditions.map(([key,value,op])=>op==='is'?`${key} is null`:op==='in'?`${key}=any(${bind(value)}::uuid[])`:`${key}=${bind(value)}`).join(' and ');
   if(operation==='select'){if(orders.length)sql+=' order by '+orders.join(',');if(limit)sql+=' limit '+limit;if(offset)sql+=' offset '+offset;}else sql+=' returning '+columns;
   return db.transaction(async tx=>{await tx.exec('set local role service_role');return tx.query(sql,params);}).then(result=>({data:single?result.rows[0]??null:result.rows,error:null})).catch(error=>({data:null,error:{message:error.message,code:error.code}})).then(resolve,reject);
  }};return q;
 },async rpc(name,args){try{return {data:(await db.transaction(async tx=>{await tx.exec('set local role service_role');return tx.query('select update_public_youtube_media($1,$2,$3::jsonb) result',[args.p_token,args.p_kind,JSON.stringify(args.p_payload)]);})).rows[0].result,error:null};}catch(error){return {data:null,error:{message:error.message,code:error.code}};}}};
 return {db,admin,W,W2,C,C2};
}
module.exports={mediaFixture};
