import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";

import { BackLink } from "@/components/layout/back-link";
import { VideoTranscriptionTool } from "@/components/tools/video-transcription-tool";
import { Button } from "@/components/ui/button";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export default async function ExtrasPage() {
  const user = await getAuthenticatedUser(await createClient());
  if (!user) redirect("/login");

  return (
    <main className="min-h-screen">
      <header className="border-b bg-background">
        <div className="mx-auto flex min-h-16 max-w-[1900px] items-center px-5 py-3 lg:px-8">
          <Button variant="ghost" size="sm" asChild><BackLink href="/services/tools"><ArrowLeft /> 돌아가기</BackLink></Button>
          <div className="mx-3 h-5 w-px bg-border" />
          <h1 className="font-semibold">영상 대본 추출</h1>
        </div>
      </header>
      <div className="mx-auto max-w-[1900px] px-5 py-8 lg:px-8 lg:py-12">
        <VideoTranscriptionTool />
      </div>
    </main>
  );
}
