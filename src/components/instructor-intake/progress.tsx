import { intakeProgress, type Answers } from "@/lib/instructor-intake/model";

export function IntakeProgress({
  answers,
  photoCount,
}: {
  answers: Answers;
  photoCount: number;
}) {
  const { received, total, percent } = intakeProgress(answers, photoCount);
  return (
    <div className="space-y-2">
      <div className="flex justify-between gap-4 text-sm">
        <span>
          수집 {received} / {total}개
        </span>
        <span className="font-semibold">{percent}%</span>
      </div>
      <progress
        className="h-2 w-full overflow-hidden rounded-full accent-primary"
        aria-label="강사 정보 수집 비율"
        value={received}
        max={total}
      />
    </div>
  );
}
