"use client";

import { ExternalLink, Printer } from "lucide-react";
import { useRef } from "react";

import {
  CONTRACT_PRINT_STYLES,
  InstructorContractDocument,
} from "@/components/contracts/instructor-contract-document";
import { Button } from "@/components/ui/button";
import type { CourseDocumentBlock } from "@/lib/course-documents/types";
import { printHtmlDocument } from "@/lib/course-settlements/print";

export function InstructorContractViewer({
  title,
  content,
  signatureImageData,
  signerName,
}: {
  title: string;
  content: CourseDocumentBlock[];
  signatureImageData?: string | null;
  signerName?: string | null;
}) {
  const previewRef = useRef<HTMLDivElement>(null);

  function printContract() {
    if (!previewRef.current) return;
    printHtmlDocument(title, `${CONTRACT_PRINT_STYLES}<main class="contract-print">${previewRef.current.innerHTML}</main>`);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" asChild>
          <a href="https://glosign.com/" target="_blank" rel="noreferrer"><ExternalLink aria-hidden="true" />글로싸인 바로가기</a>
        </Button>
        <Button type="button" onClick={printContract}><Printer aria-hidden="true" />PDF로 저장</Button>
      </div>
      <section className="overflow-hidden rounded-xl border bg-slate-100 shadow-sm" aria-label="저장된 계약서">
        <div className="max-h-[calc(100dvh-12rem)] min-h-[42rem] overflow-y-auto p-3 sm:p-6">
          <div ref={previewRef}><InstructorContractDocument content={content} signatureImageData={signatureImageData} signerName={signerName} /></div>
        </div>
      </section>
    </div>
  );
}
