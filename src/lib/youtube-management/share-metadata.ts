import type { Metadata } from "next";

type YoutubeShareKind = "brief" | "schedule";
type YoutubeShareCourse = {
  name: string;
  instructor_name: string | null;
  cohort: string | null;
  banner_image_path: string | null;
  updated_at: string;
};

function productionOrigin() {
  return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || "bizup-dashboard.vercel.app"}`;
}

function cohortLabel(value: string | null) {
  const cohort = value?.trim();
  return cohort ? `${cohort}${cohort.endsWith("기") ? "" : "기"}` : "";
}

export function youtubeShareTitle(course: Pick<YoutubeShareCourse, "name" | "instructor_name" | "cohort">) {
  const instructor = course.instructor_name?.trim() || "강사";
  const courseName = course.name.trim() || "강의";
  return [instructor, courseName, cohortLabel(course.cohort)].filter(Boolean).join("-");
}

export function youtubeShareMetadata(
  course: YoutubeShareCourse | null,
  kind: YoutubeShareKind,
  pagePath: string,
  imagePath: string,
): Metadata {
  const title = course ? youtubeShareTitle(course) : "유튜브 출연 관리";
  const description = course
    ? `${title} ${kind === "brief" ? "유튜브 출연 요청기획서" : "유튜브 출연 및 촬영 일정"}`
    : "유튜브 출연 관리 공개 페이지입니다.";
  const origin = productionOrigin();
  const pageUrl = new URL(pagePath, origin);
  const image = course?.banner_image_path ? new URL(imagePath, origin) : null;
  if (image && course) image.searchParams.set("v", course.updated_at);
  const images = image ? [{ url: image.toString(), alt: title }] : [];

  return {
    title: { absolute: title },
    description,
    openGraph: {
      title,
      description,
      type: "website",
      locale: "ko_KR",
      siteName: "BizUp",
      url: pageUrl.toString(),
      images,
    },
    twitter: { card: image ? "summary_large_image" : "summary", title, description, images },
    robots: { index: false, follow: false, nocache: true },
    referrer: "no-referrer",
  };
}
