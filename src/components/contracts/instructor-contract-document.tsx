import { DocumentRenderer } from "@/components/course-documents/document-renderer";
import type { CourseDocumentBlock } from "@/lib/course-documents/types";

export const CONTRACT_PRINT_STYLES = `<style>
@page{size:A4;margin:12mm}.contract-print{color:#0f172a;font-family:Pretendard,"Noto Sans KR",Arial,sans-serif}.contract-print *{box-sizing:border-box}.contract-print .contract-document{max-width:none!important;padding:0!important;background:#fff;font-size:10.5pt;line-height:1.78}.contract-print .contract-template-content>div{display:block}.contract-print h1{margin:0 0 20px;text-align:center;font-size:21pt;letter-spacing:-.05em}.contract-print h2{margin:18px 0 5px;padding:0;border:0;font-size:11.5pt}.contract-print h3,.contract-print h4{margin:14px 0 4px;font-size:10.5pt}.contract-print p{min-height:1.78em;margin:0;white-space:pre-wrap;word-break:keep-all}.contract-print ul,.contract-print ol{margin:4px 0;padding-left:22px}.contract-print blockquote{margin:8px 0;padding-left:12px;border-left:3px solid #94a3b8}.contract-print table{width:100%;margin:12px 0;border-collapse:collapse;font-size:9.5pt;break-inside:avoid}.contract-print th,.contract-print td{padding:5px 8px;border:1px solid #94a3b8;vertical-align:top}.contract-print th{background:#f8fafc}.contract-print img{display:block;max-width:100%;height:auto;margin:12px auto}@media print{.contract-print{width:100%}}
</style>`;

export function InstructorContractDocument({ content }: { content: CourseDocumentBlock[] }) {
  return (
    <article className="contract-document mx-auto max-w-[760px] bg-white px-6 py-10 text-[14px] leading-7 text-slate-950 sm:px-10 sm:py-12">
      <div className="contract-template-content"><DocumentRenderer blocks={content} variant="contract" /></div>
    </article>
  );
}
