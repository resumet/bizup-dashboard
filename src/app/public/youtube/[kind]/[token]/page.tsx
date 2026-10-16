import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PublicYoutubeWorkspace } from "@/components/youtube-management/public-workspace";
import { youtubeShareMetadata } from "@/lib/youtube-management/share-metadata";
import { getPublicYoutubeShare, publicMedia, MediaError } from "@/lib/youtube-management/server";
export const dynamic="force-dynamic";
type Props={params:Promise<{kind:string;token:string}>};
export async function generateMetadata({params}:Props):Promise<Metadata>{
  const {kind,token}=await params;
  if(kind!=="brief"&&kind!=="schedule")return youtubeShareMetadata(null,"schedule","/public/youtube","/public/youtube/share-image");
  const pagePath=`/public/youtube/${kind}/${encodeURIComponent(token)}`;
  try{
    const {course}=await getPublicYoutubeShare(token,kind);
    return youtubeShareMetadata(course,kind,pagePath,`${pagePath}/share-image`);
  }catch{return youtubeShareMetadata(null,kind,pagePath,"");}
}
export default async function PublicYoutubePage({params}:Props){
  const {kind,token}=await params;if(kind!=="brief"&&kind!=="schedule")notFound();
  const initial=await publicMedia(token,kind).catch(error=>{if(error instanceof MediaError&&error.status===404)notFound();throw error;});
  return <PublicYoutubeWorkspace kind={kind} token={token} initial={initial} />;
}
