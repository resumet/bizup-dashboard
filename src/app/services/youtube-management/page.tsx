import { redirect } from "next/navigation";
import { requireCourseDocumentMember } from "@/lib/course-documents/server";
import { YoutubeCourseList } from "@/components/youtube-management/course-list";
export const dynamic="force-dynamic";
export default async function YoutubeManagementPage(){
  const {admin,membership}=await requireCourseDocumentMember().catch(error=>{if(error instanceof Error&&error.message==="UNAUTHORIZED")redirect("/login");throw error;});
    const {data,error}=await admin.from("courses").select("id,name,instructor_name,cohort,status,free_webinar_at,course_youtube_appearances(count)").eq("workspace_id",membership.workspace_id).order("created_at",{ascending:false});
    if(error)throw new Error("강의 목록을 불러오지 못했습니다.");
    return <YoutubeCourseList courses={(data??[]).map(course=>({...course,appearanceCount:course.course_youtube_appearances?.[0]?.count??0}))} />;
}
