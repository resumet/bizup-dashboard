import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { IntakeForm } from "@/components/instructor-intake/intake-form";
import { publicIntake, signedPhotos } from "@/lib/instructor-intake/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "강사 정보 입력",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function PublicInstructorIntake({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const row = await publicIntake(token).catch((error) => {
    if (error instanceof Error && error.message === "NOT_FOUND") notFound();
    throw error;
  });
  const photos = await signedPhotos(row.photo_paths);
  return (
    <main className="mx-auto max-w-3xl space-y-7 px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold">강사 정보 입력</h1>
      <IntakeForm
        token={token}
        initialAnswers={row.answers}
        initialPhotos={photos}
        initialRevision={row.revision}
        submittedAt={row.submitted_at}
      />
    </main>
  );
}
