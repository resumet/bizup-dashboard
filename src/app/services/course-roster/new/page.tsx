import { ArrowLeft } from "lucide-react";

import { BackLink } from "@/components/layout/back-link";
import { ImportWizard } from "@/components/import/import-wizard";
import { Button } from "@/components/ui/button";

export default function NewJobPage() {
  return <main className="min-h-screen">
    <header className="border-b bg-background"><div className="mx-auto flex h-18 max-w-[1900px] items-center gap-3 px-5 lg:px-8"><Button variant="ghost" size="sm" asChild><BackLink href="/services/course-roster"><ArrowLeft />뒤로가기</BackLink></Button><span className="font-semibold">새 명단 가져오기</span></div></header>
    <div className="mx-auto max-w-[1900px] px-5 py-10 lg:px-8"><ImportWizard /></div>
  </main>;
}
