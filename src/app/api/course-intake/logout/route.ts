import { NextResponse, type NextRequest } from "next/server";

import {
  COURSE_INTAKE_COOKIE,
  isSameOriginRequest,
} from "@/lib/course-intake/auth";

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ message: "허용되지 않은 요청입니다." }, { status: 403 });
  }
  const response = NextResponse.json({ success: true });
  response.cookies.set(COURSE_INTAKE_COOKIE, "", {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}
