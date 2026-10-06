import Link from "next/link";
import {
  CreateIntake,
  RefreshIntakes,
} from "@/components/instructor-intake/intake-controls";
import { IntakeCard } from "@/components/instructor-intake/intake-card";
import {
  intakePageMember,
  normalizeIntake,
  type IntakeRow,
} from "@/lib/instructor-intake/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWebinarDayDifference } from "@/lib/course-operations/webinar-proximity";
import { toKoreaDate } from "@/lib/course-operations/schedule";

export default async function InstructorIntakesPage() {
  const { workspaceId } = await intakePageMember();
  const [{ data, error }, { data: courses, error: coursesError }] =
    await Promise.all([
      createAdminClient()
        .from("instructor_intakes")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("updated_at", { ascending: false }),
      createAdminClient()
        .from("courses")
        .select("id,name,instructor_name,cohort,free_webinar_at")
        .eq("workspace_id", workspaceId)
        .order("updated_at", { ascending: false }),
    ]);
  const rows = error ? [] : (data as IntakeRow[]).map(normalizeIntake);
  const todayKoreaDate = toKoreaDate(new Date().toISOString());
  const activeCourses = (courses ?? []).filter((course) => {
    const days = getWebinarDayDifference(
      course.free_webinar_at,
      todayKoreaDate,
    );
    return days === null || days > -3;
  });
  return (
    <main className="mx-auto max-w-6xl space-y-7 px-5 py-8">
      <Link
        href="/work"
        className="text-sm text-muted-foreground hover:underline"
      >
        ← 강의운영
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">강사 정보 받기</h1>
        <div className="flex items-center gap-2">
          <RefreshIntakes />
          <CreateIntake courses={activeCourses} />
        </div>
      </div>
      {coursesError ? (
        <p role="alert" className="text-sm text-destructive">
          기존 강의 목록을 불러오지 못했습니다.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-xl border p-5 text-destructive">
          {/PGRST205|42P01/.test(error.code)
            ? "강사 정보 수집 DB 마이그레이션을 먼저 적용해 주세요."
            : "강사 목록을 불러오지 못했습니다. 다시 시도해 주세요."}
        </p>
      ) : rows.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((row) => (
            <IntakeCard
              key={row.id}
              id={row.id}
              title={row.title}
              answers={row.answers}
              photoCount={row.photo_paths.length}
              shareEnabled={row.share_enabled}
              submittedAt={row.submitted_at}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">
          아직 강사 카드가 없습니다. 카드 이름을 입력하고 첫 강사 카드를 만들어
          주세요.
        </div>
      )}
    </main>
  );
}
