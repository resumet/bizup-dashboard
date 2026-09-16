"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Check, Copy } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export function PaymentIdButton({ value, name }: { value?: string; name: string }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  if (!value) return <span className="text-muted-foreground">—</span>;
  async function copy() {
    setError("");
    try { await navigator.clipboard.writeText(value!); setCopied(true); }
    catch { setCopied(false); setError("복사하지 못했습니다. 결제ID를 선택해 직접 복사해 주세요."); }
  }
  return <Dialog onOpenChange={() => { setCopied(false); setError(""); }}>
    <DialogTrigger asChild><Button type="button" size="sm" variant="outline" aria-label={`${name || "수강생"} 결제ID 보기`}>보기</Button></DialogTrigger>
    <DialogContent className="sm:max-w-sm">
      <DialogHeader><DialogTitle>결제ID</DialogTitle><DialogDescription>{name || "수강생"} 결제 정보</DialogDescription></DialogHeader>
      <p className="max-h-48 overflow-y-auto rounded-md bg-muted p-3 font-mono text-sm whitespace-pre-wrap break-all select-all">{value}</p>
      <Button type="button" variant="outline" onClick={() => void copy()}>{copied ? <Check /> : <Copy />}{copied ? "복사됨" : "결제ID 복사"}</Button>
      {copied && <p role="status" className="sr-only">결제ID를 복사했습니다.</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </DialogContent>
  </Dialog>;
}
