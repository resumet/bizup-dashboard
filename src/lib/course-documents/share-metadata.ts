import type { Metadata } from "next";

type ShareCourse = { name: string; instructor_name: string | null; banner_image_path: string | null; updated_at: string };

export function instagramShareMetadata(course: ShareCourse | null, imagePath: string): Metadata {
  const instructor = course?.instructor_name?.trim() || "강사";
  const courseName = course?.name.trim() || "강의";
  const title = course ? `${instructor}-${courseName}-인스타컨텐츠` : "인스타컨텐츠";
  const description = course ? `${instructor} 강사님의 ${courseName} 인스타그램 콘텐츠입니다.` : "공유 페이지를 확인해 주세요.";
  const origin = `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || "bizup-dashboard.vercel.app"}`;
  const image = course?.banner_image_path ? new URL(imagePath, origin) : null;
  if (image && course) image.searchParams.set("v", course.updated_at);
  const images = image ? [{ url: image.toString(), alt: title }] : [];
  return {
    title: { absolute: title },
    description,
    openGraph: { title, description, type: "website", locale: "ko_KR", images },
    twitter: { card: image ? "summary_large_image" : "summary", title, description, images },
    robots: { index: false, follow: false, nocache: true },
    referrer: "no-referrer",
  };
}
