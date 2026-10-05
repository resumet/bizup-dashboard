import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ShareIntake,
  RefreshIntakes,
} from "@/components/instructor-intake/intake-controls";
import { IntakeProgress } from "@/components/instructor-intake/progress";
import {
  intakeMember,
  memberIntake,
  signedPhotos,
} from "@/lib/instructor-intake/server";
import { FIELD_LABELS, intakeProgress } from "@/lib/instructor-intake/model";

function Urls({
  values,
  unavailable,
}: {
  values: string[];
  unavailable: boolean;
}) {
  return unavailable ? (
    <>없음</>
  ) : values.length ? (
    <ul className="space-y-2">
      {values.map((url) => (
        <li key={url}>
          <a
            className="break-all text-primary underline"
            href={url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {url}
          </a>
        </li>
      ))}
    </ul>
  ) : (
    <>미입력</>
  );
}
function won(value: number | null) {
  return value === null ? "미입력" : `${value.toLocaleString("ko-KR")}원`;
}
export default async function InstructorIntakeDetail({
  params,
}: {
  params: Promise<{ intakeId: string }>;
}) {
  const { workspaceId } = await intakeMember();
  const { intakeId } = await params;
  const row = await memberIntake(workspaceId, intakeId).catch((error) => {
    if (error instanceof Error && error.message === "NOT_FOUND") notFound();
    throw error;
  });
  const photos = await signedPhotos(row.photo_paths);
  const a = row.answers;
  const progress = intakeProgress(a, photos.length);
  const values = [
    a.realName || "미입력",
    a.nickname || "미입력",
    photos.length ? (
      <div key="photos" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {photos.map((photo, index) => (
          <a
            key={photo.path}
            href={photo.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Image
              src={photo.url}
              alt={`강사 프로필 사진 ${index + 1}`}
              width={300}
              height={300}
              unoptimized
              className="aspect-square w-full rounded-lg object-cover"
            />
          </a>
        ))}
      </div>
    ) : (
      "미입력"
    ),
    a.lectureItem || "미입력",
    a.hasTeachingExperience === null
      ? "미입력"
      : a.hasTeachingExperience
        ? `강의 있음 · ${a.teachingCount ?? "미입력"}회 · 누적 수강생 ${a.studentCount ?? "미입력"}명`
        : "강의 없음",
    <Urls
      key="materials"
      values={a.materialsUrls}
      unavailable={a.materialsUnavailable}
    />,
    <Urls
      key="youtube"
      values={a.youtubeUrls}
      unavailable={a.youtubeUnavailable}
    />,
    won(a.monthlyRevenue),
    won(a.monthlyProfit),
    `예상 월 매출 ${won(a.expectedRevenue)} · 예상 월 순이익 ${won(a.expectedProfit)}`,
    a.availableStudents === null
      ? "미입력"
      : `${a.availableStudents.toLocaleString("ko-KR")}명`,
  ];
  return (
    <main className="mx-auto max-w-4xl space-y-7 px-5 py-8">
      <Link
        href="/services/instructor-intakes"
        className="text-sm text-muted-foreground hover:underline"
      >
        ← 강사 목록
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{row.title}</h1>
        <RefreshIntakes />
      </div>
      <div className="space-y-3 rounded-xl border bg-card p-5">
        <IntakeProgress answers={a} photoCount={photos.length} />
        <p className="text-sm text-muted-foreground">
          {row.submitted_at
            ? `제출 완료 · ${new Date(row.submitted_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`
            : "제출 대기"}
          {!row.share_enabled ? " · 수집 마감" : ""}
        </p>
      </div>
      <ShareIntake
        id={row.id}
        token={row.access_token}
        enabled={row.share_enabled}
        revision={row.revision}
      />
      <dl className="divide-y rounded-xl border bg-card">
        {FIELD_LABELS.map((label, index) => (
          <div key={label} className="space-y-3 p-5 sm:p-6">
            <dt className="flex items-center justify-between gap-3 font-semibold">
              <span>
                {index + 1}. {label}
              </span>
              <span
                className={
                  progress.completed[index]
                    ? "text-sm font-normal text-emerald-600"
                    : "text-sm font-normal text-muted-foreground"
                }
              >
                {progress.completed[index] ? "수집 완료" : "미수집"}
              </span>
            </dt>
            <dd className="whitespace-pre-wrap break-words text-sm leading-relaxed">
              {values[index]}
            </dd>
          </div>
        ))}
      </dl>
    </main>
  );
}
