"use client";

import { ExternalLink, FileDown, Printer } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  COMPANY_CONTRACT_DETAILS,
  getContractEndDate,
  getKoreanDate,
  INSTRUCTOR_CONTRACT_SECTIONS,
  type InstructorContractValues,
} from "@/lib/contracts/instructor-contract";
import { printHtmlDocument } from "@/lib/course-settlements/print";

const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });

const INITIAL_VALUES: InstructorContractValues = {
  instructorName: "",
  lectureName: "",
  startDate: today,
  durationYears: 1,
  address: "",
  phone: "",
  email: "",
};

function display(value: string, fallback = "입력 예정") {
  return value.trim() || fallback;
}

function replaceVariables(text: string, values: InstructorContractValues) {
  return text
    .replaceAll("{{instructorName}}", display(values.instructorName))
    .replaceAll("{{lectureName}}", display(values.lectureName));
}

function ContractArticle({ values }: { values: InstructorContractValues }) {
  const endDate = getContractEndDate(values.startDate, values.durationYears);
  const contractPeriod = `${getKoreanDate(values.startDate) || "시작일 입력 예정"} ~ ${getKoreanDate(endDate) || "종료일 입력 예정"} (${values.durationYears || 1}년간)`;

  return (
    <article className="contract-document mx-auto max-w-[760px] bg-white px-6 py-10 text-[14px] leading-7 text-slate-950 sm:px-10 sm:py-12">
      <h1 className="text-center text-2xl font-bold tracking-[-0.04em]">비즈업클래스 강사 계약서</h1>
      <p className="mt-9 break-keep text-justify indent-4">
        ㈜비즈업클래스(이하 “회사”라 한다)와 {display(values.instructorName, "강사명")} (이하 “강사”라 한다) 간에 강의 모객 관련 협의 계약을 체결하고 상호존중의 입장에서 신의에 따라 성실히 계약상의 의무를 이행하고 완수할 것을 확약하며 계약의 증거로서 이 계약서를 2부 작성하여 각각 서명 날인한 후 “회사”와 “강사” 각 1부씩 보관한다.
      </p>

      <dl className="mt-8 overflow-hidden rounded border border-slate-300 text-sm">
        <div className="grid grid-cols-[7rem_1fr] border-b border-slate-300 last:border-b-0">
          <dt className="bg-slate-50 px-3 py-2 font-semibold">계약기간</dt>
          <dd className="px-3 py-2">{contractPeriod}</dd>
        </div>
        <div className="grid grid-cols-[7rem_1fr] border-b border-slate-300 last:border-b-0">
          <dt className="bg-slate-50 px-3 py-2 font-semibold">강의명</dt>
          <dd className="px-3 py-2">{display(values.lectureName, "강의명")}</dd>
        </div>
      </dl>

      <div className="mt-10 space-y-7">
        {INSTRUCTOR_CONTRACT_SECTIONS.map((section) => (
          <section key={section.title} className="break-inside-avoid">
            <h2 className="font-bold">{section.title}</h2>
            <div className="mt-2 space-y-2 break-keep text-justify">
              {section.paragraphs.map((paragraph, index) => (
                <p key={`${section.title}-${index}`}>{replaceVariables(paragraph, values)}</p>
              ))}
            </div>
          </section>
        ))}
      </div>

      <section className="mt-12 grid gap-4 text-sm sm:grid-cols-2">
        <div className="rounded border border-slate-300 p-4">
          <p className="font-bold">“회사”</p>
          <dl className="mt-3 space-y-1.5">
            <div><dt className="inline text-slate-600">상호 </dt><dd className="inline">{COMPANY_CONTRACT_DETAILS.name}</dd></div>
            <div><dt className="inline text-slate-600">주소 </dt><dd className="inline">{COMPANY_CONTRACT_DETAILS.address}</dd></div>
            <div><dt className="inline text-slate-600">대표이사 </dt><dd className="inline">{COMPANY_CONTRACT_DETAILS.representative} (인)</dd></div>
          </dl>
        </div>
        <div className="rounded border border-slate-300 p-4">
          <p className="font-bold">“강사”</p>
          <dl className="mt-3 space-y-1.5">
            <div><dt className="inline text-slate-600">성명 </dt><dd className="inline">{display(values.instructorName, "강사명")} (인)</dd></div>
            <div><dt className="inline text-slate-600">주소 </dt><dd className="inline">{display(values.address)}</dd></div>
            <div><dt className="inline text-slate-600">전화번호 </dt><dd className="inline">{display(values.phone)}</dd></div>
            <div><dt className="inline text-slate-600">이메일 </dt><dd className="inline">{display(values.email)}</dd></div>
          </dl>
        </div>
      </section>
    </article>
  );
}

export function InstructorContractWriter() {
  const [values, setValues] = useState<InstructorContractValues>(INITIAL_VALUES);
  const previewRef = useRef<HTMLDivElement>(null);
  const endDate = useMemo(() => getContractEndDate(values.startDate, values.durationYears), [values.durationYears, values.startDate]);

  function update<K extends keyof InstructorContractValues>(key: K, value: InstructorContractValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function printContract() {
    if (!previewRef.current) return;
    const title = `${display(values.instructorName, "강사")}_비즈업클래스_강사_계약서`;
    printHtmlDocument(title, `<main class="contract-print">${previewRef.current.innerHTML}</main>`);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="outline" asChild>
          <a href="https://glosign.com/" target="_blank" rel="noreferrer"><ExternalLink />글로싸인 바로가기</a>
        </Button>
        <Button onClick={printContract}><Printer />PDF로 저장</Button>
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <Card className="xl:sticky xl:top-21">
          <CardHeader><CardTitle>계약 정보 입력</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2"><Label htmlFor="contract-instructor">강사명</Label><Input id="contract-instructor" value={values.instructorName} onChange={(event) => update("instructorName", event.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="contract-lecture">강의명</Label><Input id="contract-lecture" value={values.lectureName} onChange={(event) => update("lectureName", event.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="contract-start">계약 시작일</Label><Input id="contract-start" type="date" value={values.startDate} onChange={(event) => update("startDate", event.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="contract-duration">계약 기간</Label><Input id="contract-duration" type="number" min="1" max="20" value={values.durationYears} onChange={(event) => update("durationYears", Math.max(1, Number(event.target.value) || 1))} /><p className="text-xs text-muted-foreground">종료일: {getKoreanDate(endDate)}</p></div>
            <div className="space-y-2"><Label htmlFor="contract-address">강사의 주소</Label><Input id="contract-address" value={values.address} onChange={(event) => update("address", event.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="contract-phone">강사의 전화번호</Label><Input id="contract-phone" type="tel" value={values.phone} onChange={(event) => update("phone", event.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="contract-email">강사의 이메일주소</Label><Input id="contract-email" type="email" value={values.email} onChange={(event) => update("email", event.target.value)} /></div>
          </CardContent>
        </Card>

        <section className="overflow-hidden rounded-xl border bg-slate-100 shadow-sm" aria-label="계약서 미리보기">
          <div className="flex items-center justify-between border-b bg-white px-5 py-3"><h2 className="font-semibold">계약서 전문</h2><span className="text-xs text-muted-foreground">입력 내용이 즉시 반영됩니다.</span></div>
          <div className="max-h-[calc(100dvh-12rem)] min-h-[42rem] overflow-y-auto p-3 sm:p-6">
            <div ref={previewRef}><ContractArticle values={values} /></div>
          </div>
        </section>
      </div>
    </div>
  );
}
