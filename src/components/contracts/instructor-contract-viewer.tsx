"use client";

import { InstructorContractDocument } from "@/components/contracts/instructor-contract-document";
import type { CourseDocumentBlock } from "@/lib/course-documents/types";

export function InstructorContractViewer({ content }: { content: CourseDocumentBlock[] }) {
  return (
    <section className="overflow-hidden rounded-xl border bg-slate-100 shadow-sm" aria-label="저장된 계약서">
      <div className="max-h-[calc(100dvh-12rem)] min-h-[42rem] overflow-y-auto p-3 sm:p-6">
        <InstructorContractDocument content={content} />
      </div>
    </section>
  );
}

