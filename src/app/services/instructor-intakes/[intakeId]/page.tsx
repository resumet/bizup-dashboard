import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RefreshIntakes, ShareIntake } from "@/components/instructor-intake/intake-controls";
import { IntakeProgress } from "@/components/instructor-intake/progress";
import { FIELD_DESCRIPTION_LINKS, FIELD_LABELS, intakeProgress, type Photo } from "@/lib/instructor-intake/model";
import { intakePageMember, memberIntake, signedImageGroups, signedPhotos } from "@/lib/instructor-intake/server";

function Urls({ values, unavailable }: { values: string[]; unavailable: boolean }) {
  if (unavailable) return <>없음</>;
  if (!values.length) return <>미입력</>;
  return <ul className="space-y-2">{values.map((url) => <li key={url}><a className="break-all text-primary underline" href={url} target="_blank" rel="noopener noreferrer">{url}</a></li>)}</ul>;
}
function won(value: number | null) { return value === null ? "미입력" : `${value.toLocaleString("ko-KR")}원`; }
function Gallery({ photos, label }: { photos: Photo[]; label: string }) {
  if (!photos.length) return <>미입력</>;
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{photos.map((photo, index) => <div key={photo.path} className="space-y-2">
    <a href={photo.url} target="_blank" rel="noopener noreferrer"><Image src={photo.url} alt={`${label} ${index + 1}`} width={320} height={240} unoptimized className="aspect-[4/3] w-full rounded-lg object-cover" /></a>
    <a href={photo.downloadUrl ?? photo.url} className="block rounded-md border px-3 py-2 text-center text-xs font-medium hover:bg-accent">사진 {index + 1} 다운로드</a>
  </div>)}</div>;
}

export default async function InstructorIntakeDetail({ params }: { params: Promise<{ intakeId: string }> }) {
  const { workspaceId } = await intakePageMember();
  const { intakeId } = await params;
  const row = await memberIntake(workspaceId, intakeId).catch((error) => {
    if (error instanceof Error && error.message === "NOT_FOUND") notFound();
    throw error;
  });
  const [photos, images] = await Promise.all([
    signedPhotos(row.photo_paths, true),
    signedImageGroups(row.image_paths, true),
  ]);
  const a = row.answers;
  const progress = intakeProgress(a, photos.length, row.image_paths);
  const values = [
    a.realName || "미입력", a.nickname || "미입력", <Gallery key="profile" photos={photos} label="프로필 사진" />,
    a.lectureItem || "미입력", a.courseContentIntroduction || "미입력", a.instructorCareer || "미입력",
    <Gallery key="evidence" photos={images.evidence} label="증빙 자료" />,
    <div key="results" className="space-y-4"><Gallery photos={images.studentResults} label="수강생 성과 인증" /><div className="whitespace-pre-wrap">{a.studentSuccessDescription || "상세 설명 미입력"}</div></div>,
    <Gallery key="reviews" photos={images.reviews} label="수강후기" />,
    a.differentiators || "미입력",
    a.webinarCoreContents.some(Boolean) ? <ol key="core" className="list-decimal space-y-2 pl-5">{a.webinarCoreContents.map((content, index) => <li key={index}>{content || "미입력"}</li>)}</ol> : "미입력",
    a.fieldStrengths || "미입력", a.recommendedAudience || "미입력", a.webinarBenefits || "미입력",
    <div key="opportunity" className="space-y-4"><div className="whitespace-pre-wrap">{a.opportunityEvidence || "설명 미입력"}</div><Gallery photos={images.opportunity} label="기회 증거 자료" /></div>,
    a.hasTeachingExperience === null ? "미입력" : a.hasTeachingExperience ? `강의 있음 · ${a.teachingCount ?? "미입력"}회 · 누적 수강생 ${a.studentCount ?? "미입력"}명` : "강의 없음",
    <Urls key="materials" values={a.materialsUrls} unavailable={a.materialsUnavailable} />,
    <Urls key="youtube" values={a.youtubeUrls} unavailable={a.youtubeUnavailable} />,
    won(a.monthlyRevenue), won(a.monthlyProfit), `예상 월 매출 ${won(a.expectedRevenue)} · 예상 월 순이익 ${won(a.expectedProfit)}`,
    a.availableStudents === null ? "미입력" : `${a.availableStudents.toLocaleString("ko-KR")}명`,
    `아이디: ${a.instagramAccountId || "미입력"}\n비밀번호: ${a.instagramAccountPassword || "미입력"}`,
    a.blueBadge || "미입력", a.twoFactorSecurity || "미입력",
    `아이디: ${a.infokLinkId || "미입력"}\n비밀번호: ${a.infokLinkPassword || "미입력"}`,
  ];
  return <main className="mx-auto max-w-5xl space-y-7 px-5 py-8">
    <Link href="/services/instructor-intakes" className="text-sm text-muted-foreground hover:underline">← 강사 목록</Link>
    <div className="flex flex-wrap items-center justify-between gap-4"><h1 className="text-2xl font-semibold">{row.title}</h1><div className="flex items-center gap-2"><Link href="/services/instructor-intakes/settings" className="inline-flex h-9 items-center rounded-md border px-4 text-sm font-medium hover:bg-accent">예시 설정</Link><RefreshIntakes /></div></div>
    <div className="space-y-3 rounded-xl border bg-card p-5"><IntakeProgress answers={a} photoCount={photos.length} imagePaths={row.image_paths} /><p className="text-sm text-muted-foreground">{row.submitted_at ? `제출 완료 · ${new Date(row.submitted_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}` : "제출 대기"}{!row.share_enabled ? " · 수집 마감" : ""}</p></div>
    <ShareIntake id={row.id} token={row.access_token} enabled={row.share_enabled} revision={row.revision} />
    <dl className="divide-y rounded-xl border bg-card">{FIELD_LABELS.map((label, index) => <div key={label} className="space-y-3 p-5 sm:p-6"><dt className="flex items-center justify-between gap-3 font-semibold"><span className="flex flex-wrap items-center gap-2"><span>{index + 1}. {label}</span>{FIELD_DESCRIPTION_LINKS[index] ? <a href={FIELD_DESCRIPTION_LINKS[index]} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-primary underline underline-offset-4">(설명보기)</a> : null}</span><span className={progress.completed[index] ? "text-sm font-normal text-emerald-600" : "text-sm font-normal text-muted-foreground"}>{progress.completed[index] ? "수집 완료" : "미수집"}</span></dt><dd className="whitespace-pre-wrap break-words text-sm leading-relaxed">{values[index]}</dd></div>)}</dl>
  </main>;
}
