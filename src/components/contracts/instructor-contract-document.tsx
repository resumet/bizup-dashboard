import { DocumentRenderer } from "@/components/course-documents/document-renderer";
import type { CourseDocumentBlock } from "@/lib/course-documents/types";

export const CONTRACT_PRINT_STYLES = `
@media print {
  @page { size: A4; margin: 12mm; }
  body { background: #fff !important; }
  body * { visibility: hidden !important; }
  #contract-print-root, #contract-print-root * { visibility: visible !important; }
  #contract-print-root {
    position: absolute;
    inset: 0 auto auto 0;
    width: 100%;
  }
  #contract-print-root .contract-document {
    max-width: 760px;
    margin: 0 auto;
    padding: 2.5rem;
    background: #fff;
  }
  #contract-print-root table { break-inside: avoid; }
}
`;

export function InstructorContractDocument({ content }: { content: CourseDocumentBlock[] }) {
  return (
    <article id="contract-print-root" className="contract-document mx-auto max-w-[760px] bg-white px-6 py-10 text-[14px] leading-7 text-slate-950 sm:px-10 sm:py-12">
      <style dangerouslySetInnerHTML={{ __html: CONTRACT_PRINT_STYLES }} />
      <div className="contract-template-content"><DocumentRenderer blocks={content} variant="contract" /></div>
    </article>
  );
}

