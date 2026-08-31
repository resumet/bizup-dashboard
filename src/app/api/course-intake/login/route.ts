import { NextResponse, type NextRequest } from "next/server";

import {
  COURSE_INTAKE_COOKIE,
  COURSE_INTAKE_SESSION_SECONDS,
  createCourseIntakeToken,
  isSameOriginRequest,
  secureStringEqual,
} from "@/lib/course-intake/auth";
import { getCourseIntakeConfig } from "@/lib/course-intake/config";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    if (!isSameOriginRequest(request)) {
      return NextResponse.json({ message: "허용되지 않은 요청입니다." }, { status: 403 });
    }
    const config = getCourseIntakeConfig();
    const body = (await request.json()) as { password?: unknown };
    const password = typeof body.password === "string" ? body.password : "";
    if (!secureStringEqual(password, config.password)) {
      return NextResponse.json({ message: "비밀번호가 올바르지 않습니다." }, { status: 401 });
    }

    const response = NextResponse.json({ success: true });
    response.cookies.set(
      COURSE_INTAKE_COOKIE,
      createCourseIntakeToken(config.sessionSecret),
      {
        httpOnly: true,
        sameSite: "strict",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: COURSE_INTAKE_SESSION_SECONDS,
      },
    );
    return response;
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "강의 생성 페이지 설정을 확인해 주세요.",
      },
      { status: 500 },
    );
  }
}
