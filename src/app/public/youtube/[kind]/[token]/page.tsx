import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PublicYoutubeWorkspace } from "@/components/youtube-management/public-workspace";
import { publicMedia, MediaError } from "@/lib/youtube-management/server";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"유튜브 출연 관리",robots:{index:false,follow:false},referrer:"no-referrer"};
export default async function PublicYoutubePage({params}:{params:Promise<{kind:string;token:string}>}){
  const {kind,token}=await params;if(kind!=="brief"&&kind!=="schedule")notFound();
  const initial=await publicMedia(token,kind).catch(error=>{if(error instanceof MediaError&&error.status===404)notFound();throw error;});
  return <PublicYoutubeWorkspace kind={kind} token={token} initial={initial} />;
}
