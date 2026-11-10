"use client";

import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";

export function InstructorContractPrintButton() {
  return (
    <Button type="button" onClick={() => window.print()}>
      <Download aria-hidden="true" />
      PDF로 출력하기
    </Button>
  );
}
