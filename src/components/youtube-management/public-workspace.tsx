"use client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { AppearanceEditor, BriefEditor, mediaRequest } from "./editors";
import type { Appearance, Brief } from "@/lib/youtube-management/model";
export function PublicYoutubeWorkspace({kind,token,initial}:{kind:"brief"|"schedule";token:string;initial:{course:{name:string;instructor_name:string};brief?:Brief;revision?:number;appearances?:Appearance[]}}){
  const router=useRouter();const endpoint=`/api/public/youtube/${kind}/${token}`;
  return <main className="mx-auto max-w-5xl space-y-6 px-5 py-8">
    <h1 className="text-2xl font-semibold">{initial.course.instructor_name} · {initial.course.name} {kind==="brief"?"출연 요청기획서":"출연 및 촬영 일정"}</h1>
    <div className="flex justify-end"><Button variant="outline" onClick={()=>{if(window.confirm("저장하지 않은 내용은 사라집니다. 최신 내용을 불러올까요?"))router.refresh();}}>새로고침</Button></div>
    {kind==="brief"&&initial.brief?<BriefEditor key={initial.revision} initial={initial.brief} revision={initial.revision??0} onSave={async(brief,revision)=>{const result=await mediaRequest(endpoint,{brief,revision});return result.revision;}} />:<AppearanceEditor key={JSON.stringify(initial.appearances?.map(row=>[row.id,row.revision]))} initial={initial.appearances??[]} publicMode onSave={async row=>({...row,...await mediaRequest(endpoint,row)})} />}
  </main>;
}
