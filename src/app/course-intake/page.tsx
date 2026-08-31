import { cookies } from "next/headers";

import { IntakeCourseForm } from "@/components/course-intake/intake-course-form";
import { IntakeLoginForm } from "@/components/course-intake/intake-login-form";
import { COURSE_INTAKE_COOKIE, verifyCourseIntakeToken } from "@/lib/course-intake/auth";
import { getCourseIntakeConfig, getCourseIntakeConfigurationError } from "@/lib/course-intake/config";

export const dynamic = "force-dynamic";

export default async function CourseIntakePage() {
  const configurationError = getCourseIntakeConfigurationError();
  let authenticated = false;
  if (!configurationError) {
    const cookieStore = await cookies();
    const config = getCourseIntakeConfig();
    authenticated = verifyCourseIntakeToken(
      cookieStore.get(COURSE_INTAKE_COOKIE)?.value,
      config.sessionSecret,
    );
  }

  return (
    <main className="grid min-h-screen place-items-center bg-muted/30 px-5 py-10">
      {authenticated ? (
        <IntakeCourseForm />
      ) : (
        <IntakeLoginForm configurationError={configurationError} />
      )}
    </main>
  );
}
