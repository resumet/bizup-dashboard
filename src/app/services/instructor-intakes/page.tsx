import Link from "next/link";
import {
  CreateIntake,
  RefreshIntakes,
} from "@/components/instructor-intake/intake-controls";
import { intakeProgress } from "@/lib/instructor-intake/model";
import { IntakeProgress } from "@/components/instructor-intake/progress";
import {
  intakePageMember,
  normalizeIntake,
  type IntakeRow,
} from "@/lib/instructor-intake/server";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function InstructorIntakesPage() {
  const { workspaceId } = await intakePageMember();
  const { data, error } = await createAdminClient()
    .from("instructor_intakes")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false });
  const rows = error ? [] : (data as IntakeRow[]).map(normalizeIntake);
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
        <RefreshIntakes />
      </div>
      <CreateIntake />
      {error ? (
        <p role="alert" className="rounded-xl border p-5 text-destructive">
          {/PGRST205|42P01/.test(error.code)
            ? "강사 정보 수집 DB 마이그레이션을 먼저 적용해 주세요."
            : "강사 목록을 불러오지 못했습니다. 다시 시도해 주세요."}
        </p>
      ) : rows.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((row) => (
            <Link
              key={row.id}
              href={`/services/instructor-intakes/${row.id}`}
              className="space-y-5 rounded-xl border bg-card p-5 transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-primary"
            >
              <h2 className="truncate text-lg font-semibold">{row.title}</h2>
              <IntakeProgress
                answers={row.answers}
                photoCount={row.photo_paths.length}
              />
              <div className="flex justify-between gap-3 text-sm text-muted-foreground">
                <span>
                  {!row.share_enabled
                    ? "수집 마감"
                    : row.submitted_at
                      ? "제출 완료"
                      : intakeProgress(row.answers, row.photo_paths.length)
                            .received > 0
                        ? "작성 중"
                        : "입력 대기"}
                </span>
                <span>사진 {row.photo_paths.length}장</span>
              </div>
              {row.answers.nickname || row.answers.realName ? (
                <p className="truncate text-sm">
                  {[row.answers.realName, row.answers.nickname]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              ) : null}
            </Link>
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
