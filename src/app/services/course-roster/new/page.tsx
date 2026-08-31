import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { ImportWizard } from "@/components/import/import-wizard";
import { Button } from "@/components/ui/button";

export default function NewJobPage() {
  return <main className="min-h-screen">
    <header className="border-b bg-background"><div className="mx-auto flex h-18 max-w-[1600px] items-center px-5 lg:px-8"><Button variant="ghost" size="sm" asChild><Link href="/services/course-roster"><ArrowLeft />작업 목록</Link></Button></div></header>
    <div className="mx-auto max-w-[1600px] px-5 py-10 lg:px-8"><ImportWizard /></div>
  </main>;
}
