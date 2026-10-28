import Link from "next/link";
import { IntakeSettingsEditor } from "@/components/instructor-intake/settings-editor";
import {
  intakePageMember,
  intakeSettings,
  signedImageGroups,
} from "@/lib/instructor-intake/server";

export default async function InstructorIntakeSettingsPage() {
  const { workspaceId } = await intakePageMember();
  const settings = await intakeSettings(workspaceId);
  const exampleImages = await signedImageGroups(settings.exampleImagePaths);
  return (
    <main className="mx-auto max-w-5xl space-y-7 px-5 py-8">
      <Link href="/services/instructor-intakes" className="text-sm text-muted-foreground hover:underline">
        ← 강사 정보 받기
      </Link>
      <h1 className="text-2xl font-semibold">강사 정보 받기 설정</h1>
      <IntakeSettingsEditor initialSettings={settings} initialImages={exampleImages} />
    </main>
  );
}
