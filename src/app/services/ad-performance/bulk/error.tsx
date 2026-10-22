"use client";
import { Button } from "@/components/ui/button";

export default function Error({ reset }: { reset: () => void }) {
  return <main className="space-y-4 p-8"><h1 className="text-2xl font-semibold">광고성과 일괄 보기</h1>
    <p role="alert">성과 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p><Button onClick={reset}>다시 시도</Button></main>;
}
