import { notFound, redirect } from "next/navigation";
import { YoutubeWorkspace } from "@/components/youtube-management/workspace";
import { loadMedia, MediaError } from "@/lib/youtube-management/server";
export const dynamic="force-dynamic";
export default async function YoutubeCoursePage({params}:{params:Promise<{courseId:string}>}){
  const {courseId}=await params;
  const initial=await loadMedia(courseId).catch(error=>{if(error instanceof Error&&error.message==="UNAUTHORIZED")redirect("/login");if(error instanceof MediaError&&error.status===404)notFound();throw error;});
  return <YoutubeWorkspace initial={initial} />;
}
