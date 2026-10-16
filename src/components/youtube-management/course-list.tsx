"use client";
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MediaNotice, mediaRequest } from "./editors";
import type { CourseMedia } from "@/lib/youtube-management/model";
type Connection={configured:boolean;canManage:boolean;parentId:string;parentKind:"data_source"|"page";titleProperty:string};
export function YoutubeCourseList({courses}:{courses:Array<CourseMedia&{appearanceCount:number}>}){
  const [search,setSearch]=useState("");const [open,setOpen]=useState(false);const [connection,setConnection]=useState<Connection|null>(null);const [token,setToken]=useState("");const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");
  async function openConnection(){setBusy(true);try{const response=await fetch("/api/youtube-management/notion-connection",{cache:"no-store"});const body=await response.json();if(!response.ok)throw new Error(body.message);setConnection(body);setOpen(true);}catch(error){setMessage(error instanceof Error?error.message:"연결을 불러오지 못했습니다.");}finally{setBusy(false);}}
  const visible=courses.filter(course=>`${course.name} ${course.instructor_name} ${course.cohort}`.toLowerCase().includes(search.toLowerCase()));
  return <main className="mx-auto max-w-6xl space-y-6 px-5 py-8">
    <Link href="/work" className="text-sm hover:underline">← 운영 워크스페이스</Link>
    <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-semibold">유튜브 출연 관리</h1><Button variant="outline" disabled={busy} onClick={()=>void openConnection()}>노션 연결</Button></div>
    <Input aria-label="강의 검색" placeholder="강의명, 강사명, 기수 검색" value={search} onChange={event=>setSearch(event.target.value)} />
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{visible.map(course=><Link key={course.id} href={`/services/youtube-management/${course.id}`} className="space-y-4 rounded-xl border p-5 transition-colors hover:bg-muted/50"><h2 className="text-lg font-semibold">{course.name}</h2><p className="text-sm">{course.instructor_name||"강사 미지정"}{course.cohort?` · ${course.cohort}`:""}</p><div className="flex justify-between text-sm text-muted-foreground"><span>출연 채널 {course.appearanceCount}개</span><span>{({completed:"완료",canceled:"취소",on_hold:"보류",active:"진행 중",planned:"예정"} as Record<string,string>)[course.status]||course.status}</span></div></Link>)}</div>
    {!visible.length&&<p className="py-8 text-center text-muted-foreground">표시할 강의가 없습니다.</p>}
    <Dialog open={open} onOpenChange={value=>{if(!busy){setOpen(value);if(!value)setToken("");}}}><DialogContent aria-describedby={undefined}><DialogHeader><DialogTitle>노션 연결</DialogTitle></DialogHeader>
      {connection&&<form className="space-y-4" onSubmit={async event=>{event.preventDefault();setBusy(true);try{await mediaRequest("/api/youtube-management/notion-connection",{token,parentId:connection.parentId,parentKind:connection.parentKind,titleProperty:connection.titleProperty});setToken("");setOpen(false);setMessage("노션 연결을 저장했습니다.");}catch(error){setMessage(error instanceof Error?error.message:"연결하지 못했습니다.");}finally{setBusy(false);}}}>
        <p className="text-sm">{connection.configured?"노션 연결됨":"노션 연결 필요"}</p>
        {!connection.canManage?<p className="text-sm">관리자가 노션 연결을 설정할 수 있습니다.</p>:<>
          <label className="block space-y-2 text-sm">Notion 연결 토큰<Input type="password" autoComplete="off" value={token} onChange={event=>setToken(event.target.value)} required disabled={busy} /><span className="block text-muted-foreground">Notion 연결에 ‘유튜브 RS 채널 문의’ 접근 권한을 부여한 뒤 토큰을 입력해 주세요.</span></label>
          <label className="block space-y-2 text-sm">데이터 소스 ID<Input value={connection.parentId} onChange={event=>setConnection({...connection,parentId:event.target.value})} required disabled={busy} /></label>
          <label className="block space-y-2 text-sm">제목 속성<Input value={connection.titleProperty} onChange={event=>setConnection({...connection,titleProperty:event.target.value})} required disabled={busy} /></label>
          <p className="text-sm text-muted-foreground">노션의 웹 공개는 노션 페이지에서 공유 → 게시로 설정합니다. 이후 요청서 변경은 같은 페이지에 반영됩니다.</p>
        </>}
        <DialogFooter><DialogClose asChild><Button type="button" variant="outline" disabled={busy}>닫기</Button></DialogClose>{connection.canManage&&<Button disabled={busy}>{busy?"확인 중…":"연결 저장"}</Button>}</DialogFooter>
      </form>}
    </DialogContent></Dialog>
    <MediaNotice message={message} onClose={()=>setMessage("")} />
  </main>;
}
