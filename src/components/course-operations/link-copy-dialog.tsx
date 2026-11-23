"use client";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";

export function LinkCopyDialog({ paymentQr, inquiryQr }: { paymentQr: string; inquiryQr: string }) {
  const message = `✅ 결제하기\n${paymentQr.trim()}\n\n✅ 문의하기\n${inquiryQr.trim()}\n\n✅ 커리큘럼\n${paymentQr.trim()}`;
  return <Dialog><DialogTrigger asChild><Button type="button" variant="outline"><Copy />복사</Button></DialogTrigger>
    <DialogContent aria-describedby={undefined}>
      <DialogHeader><DialogTitle>링크 문구 복사</DialogTitle></DialogHeader>
      <Textarea aria-label="복사할 링크 문구" readOnly value={message} rows={9} onFocus={event => event.target.select()} />
      <Button type="button" onClick={async () => {
        try { await navigator.clipboard.writeText(message); toast("문구를 복사했습니다."); }
        catch { toast("클립보드에 접근하지 못했습니다. 문구를 선택해 직접 복사해 주세요.", { tone: "error" }); }
      }}><Copy />클립보드로 복사</Button>
    </DialogContent>
  </Dialog>;
}
