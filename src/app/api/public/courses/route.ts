import { courseApiResponse } from "@/lib/course-operations/public-api";
import { loadPublicCourses } from "@/lib/course-operations/public-api-server";

export const dynamic = "force-dynamic";
export async function GET(request: Request) { return courseApiResponse(request, loadPublicCourses); }
export async function OPTIONS(request: Request) { return courseApiResponse(request, loadPublicCourses); }
