import type { Metadata } from "next";
import { getExternalCourse } from "@/lib/course-documents/server";
import { instagramShareMetadata } from "@/lib/course-documents/share-metadata";

export async function generateMetadata({ params }: { params: Promise<{ accessToken: string }> }): Promise<Metadata> {
  const { accessToken } = await params;
  try {
    const { course } = await getExternalCourse(accessToken);
    return instagramShareMetadata(course, `/write/${accessToken}/share-image`);
  } catch { return instagramShareMetadata(null, ""); }
}

export default function ExternalWriterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
