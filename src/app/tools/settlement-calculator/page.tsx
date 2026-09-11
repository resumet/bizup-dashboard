import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SettlementCalculator } from "@/components/tools/settlement-calculator";

export const metadata: Metadata = {
  title: "강의 정산 계산기 | 비즈업클래스",
  description: "강의 가격과 판매 수량, 비용으로 회사와 강사의 예상 정산금을 실시간 계산합니다.",
};

export default function SettlementCalculatorPage() {
  return <main className="min-h-screen bg-[#f4f6fa] text-[#192641]">
    <nav aria-label="서비스 이동" className="border-b border-[#e4e9f1] bg-white"><div className="mx-auto max-w-[1320px] px-4 py-3 sm:px-6"><Link href="/" className="inline-flex items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-[#f4f6fa] focus-visible:outline-2 focus-visible:outline-[#244fdd]"><ArrowLeft className="size-4" />간편 도구로 돌아가기</Link></div></nav>
    <SettlementCalculator />
  </main>;
}
