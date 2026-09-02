import { redirect } from "next/navigation";

type Props = { params: Promise<{ courseId: string }> };
export default async function CourseSettlementPage({ params }: Props) {
  const { courseId } = await params;
  redirect(`/services/course-operations/${courseId}?tab=settlement`);
}
