import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { FileSignature, ShieldCheck } from "lucide-react";

import { InstructorContractDocument } from "@/components/contracts/instructor-contract-document";
import { PublicInstructorContractSigning } from "@/components/contracts/public-instructor-contract-signing";
import { loadPublicInstructorContract, InstructorContractError } from "@/lib/contracts/instructor-contract-template-server";

type Props = { params: Promise<{ token: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const contract = await loadPublicInstructorContract(token).catch(() => null);
  const title = contract ? `${contract.title} 전자계약` : "전자계약";
  return { title, robots: { index: false, follow: false, nocache: true } };
}

export default async function PublicInstructorContractPage({ params }: Props) {
  const { token } = await params;
  const contract = await loadPublicInstructorContract(token).catch((error: unknown) => {
    if (error instanceof InstructorContractError && error.status === 404) notFound();
    throw error;
  });
  return (
    <main className="min-h-screen bg-slate-100 py-6 sm:py-10">
      <div className="mx-auto w-full max-w-5xl space-y-5 px-4 sm:px-6">
        <header className="rounded-xl border bg-white px-5 py-4 shadow-sm">
          <div className="flex items-start gap-3"><div className="rounded-lg bg-primary/10 p-2 text-primary"><FileSignature className="size-5" aria-hidden="true" /></div><div><h1 className="text-xl font-semibold tracking-tight">{contract.title}</h1><p className="mt-1 text-sm text-muted-foreground">비즈업클래스 전자계약</p></div></div>
        </header>
        {contract.signingStatus === "completed" ? <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"><ShieldCheck className="size-4" aria-hidden="true" />전자서명이 완료된 계약서입니다.</div> : null}
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <section id="public-contract-document" className="overflow-hidden rounded-xl border bg-white shadow-sm" aria-label="계약서 전문"><div className="border-b px-5 py-3"><h2 className="font-semibold">계약서 전문</h2></div><div className="max-h-[calc(100dvh-11rem)] overflow-y-auto p-4 sm:p-7"><InstructorContractDocument content={contract.renderedContent} signatureImageData={contract.signatureImageData} signerName={contract.signerName} />{contract.signingStatus === "completed" && contract.signatureImageData ? <section className="mt-10 border-t pt-5"><h2 className="font-semibold">전자서명</h2><div className="mt-3 flex flex-wrap items-center gap-4"><Image src={contract.signatureImageData} alt={`${contract.signerName ?? "강사"} ${contract.signerMethod === "seal" ? "도장" : "서명"}`} width={208} height={72} unoptimized className="h-[4.5rem] max-w-52 object-contain" /><div className="text-sm text-muted-foreground"><p>{contract.signerName}</p><p>{contract.signerMethod === "seal" ? "도장" : "서명"} 완료</p></div></div></section> : null}</div></section>
          <aside className="lg:sticky lg:top-20"><PublicInstructorContractSigning token={token} title={contract.title} instructorName={contract.values.instructorName} signingStatus={contract.signingStatus} signedAt={contract.signedAt} /></aside>
        </div>
      </div>
    </main>
  );
}
