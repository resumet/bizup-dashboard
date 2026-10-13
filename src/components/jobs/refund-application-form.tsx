"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { Download, Loader2, Printer } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatPaymentAmount } from "@/lib/jobs/payment-fields";
import { REFUND_APPLICATION_REASONS, refundApplicantSignature, refundApplicationAmount, refundApplicationSchema, type RefundApplicationInput } from "@/lib/jobs/refund-application";

const fields = [
  { key: "name", label: "이름", type: "text", maxLength: 120 },
  { key: "phone", label: "전화번호", type: "tel", maxLength: 30 },
  { key: "email", label: "이메일 주소", type: "email", maxLength: 254 },
  { key: "courseName", label: "강의명", type: "text", maxLength: 200 },
  { key: "paymentAmount", label: "결제금액", type: "text", maxLength: 17 },
  { key: "refundRate", label: "환불율", type: "number", maxLength: undefined },
  { key: "date", label: "날짜", type: "date", maxLength: undefined },
] as const;

export function RefundApplicationForm({ initialValues, onBack, onMarkRefunded, onBusyChange }: {
  initialValues: RefundApplicationInput;
  onBack: (values: RefundApplicationInput) => void;
  onMarkRefunded: () => Promise<void>;
  onBusyChange: (busy: boolean) => void;
}) {
  const prefix = useId();
  const [form, setForm] = useState(initialValues);
  const [busy, setBusy] = useState<"save" | "print" | "refund" | null>(null);
  const busyRef = useRef(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof RefundApplicationInput, string>>>({});
  let refundAmount: number | null = null;
  try { refundAmount = refundApplicationAmount(form); } catch { /* Display the amount after both numbers are valid. */ }

  async function perform(action: "save" | "print" | "refund") {
    if (busyRef.current) return;
    setError("");
    setStatus("");
    const parsed = refundApplicationSchema.safeParse(form);
    if (action !== "refund" && !parsed.success) {
      const errors: typeof fieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof RefundApplicationInput;
        errors[field] ??= issue.message;
      }
      setFieldErrors(errors);
      document.getElementById(`${prefix}-${Object.keys(errors)[0]}`)?.focus();
      return;
    }
    setFieldErrors({});
    // Open synchronously while the click still has browser user activation.
    const popup = action === "print" ? window.open("", "_blank") : null;
    if (action === "print" && !popup) {
      setError("출력 창을 열 수 없습니다. 이 사이트의 팝업을 허용해 주세요.");
      return;
    }
    if (popup) {
      popup.opener = null;
      popup.document.title = "환불신청서";
      popup.document.body.textContent = "PDF를 준비하고 있습니다…";
    }
    busyRef.current = true;
    setBusy(action);
    onBusyChange(true);
    try {
      if (action === "refund") {
        await onMarkRefunded();
      } else if (parsed.success) {
        const pdf = await import("@/lib/jobs/refund-application-pdf");
        if (action === "print" && popup) {
          await pdf.printRefundApplicationPdf(parsed.data, popup);
          setStatus("PDF 출력 창을 열었습니다. 인쇄창이 자동으로 열리지 않으면 PDF의 인쇄 버튼을 눌러 주세요.");
        } else {
          await pdf.saveRefundApplicationPdf(parsed.data);
          setStatus("PDF를 다운로드했습니다.");
        }
      }
    } catch (caught) {
      popup?.close();
      setError(caught instanceof Error ? caught.message : "처리하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      busyRef.current = false;
      setBusy(null);
      onBusyChange(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void perform("save");
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <DialogHeader><DialogTitle>환불신청하기</DialogTitle></DialogHeader>
      {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
      <fieldset disabled={busy !== null} className="grid gap-4 sm:grid-cols-2">
        {fields.map(({ key, label, type, maxLength }) => (
          <div className={key === "courseName" ? "space-y-2 sm:col-span-2" : "space-y-2"} key={key}>
            <Label htmlFor={`${prefix}-${key}`}>{label}{key === "paymentAmount" ? " (원)" : key === "refundRate" ? " (%)" : ""}</Label>
            <Input id={`${prefix}-${key}`} name={key} type={type} required maxLength={maxLength}
              inputMode={key === "paymentAmount" ? "numeric" : key === "refundRate" ? "decimal" : undefined}
              min={key === "refundRate" ? 0 : key === "date" ? "1900-01-01" : undefined}
              max={key === "refundRate" ? 100 : key === "date" ? "9999-12-31" : undefined}
              step={key === "refundRate" ? "0.01" : undefined}
              value={form[key]}
              aria-invalid={Boolean(fieldErrors[key])}
              aria-describedby={fieldErrors[key] ? `${prefix}-${key}-error` : key === "refundRate" ? `${prefix}-refund-amount` : undefined}
              onChange={(event) => {
                setForm((current) => ({ ...current, [key]: event.target.value }));
                setFieldErrors((current) => ({ ...current, [key]: undefined }));
                setStatus("");
              }}
              onBlur={key === "paymentAmount" ? () => setForm((current) => ({ ...current, paymentAmount: formatPaymentAmount(current.paymentAmount) })) : undefined}
            />
            {fieldErrors[key] ? <p id={`${prefix}-${key}-error`} className="text-sm text-destructive">{fieldErrors[key]}</p> : null}
            {key === "refundRate" ? <p id={`${prefix}-refund-amount`} className="text-sm text-muted-foreground">{refundAmount === null ? "결제금액과 환불율을 입력하면 환불금액을 계산합니다." : `환불금액 ${refundAmount.toLocaleString("ko-KR")}원 (원 미만 버림)`}</p> : null}
          </div>
        ))}
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor={`${prefix}-reason`}>환불 신청 사유</Label>
          <Select value={form.reason} disabled={busy !== null} required onValueChange={(reason) => {
            setForm((current) => ({ ...current, reason }));
            setFieldErrors((current) => ({ ...current, reason: undefined, reasonDetail: undefined }));
            setStatus("");
          }}>
            <SelectTrigger id={`${prefix}-reason`} aria-invalid={Boolean(fieldErrors.reason)} aria-describedby={fieldErrors.reason ? `${prefix}-reason-error` : undefined}>
              <SelectValue placeholder="사유를 선택해 주세요" />
            </SelectTrigger>
            <SelectContent>{REFUND_APPLICATION_REASONS.map(({ value, label }) => <SelectItem key={value} value={value}>{value}. {label}</SelectItem>)}</SelectContent>
          </Select>
          {fieldErrors.reason ? <p id={`${prefix}-reason-error`} className="text-sm text-destructive">{fieldErrors.reason}</p> : null}
        </div>
        {form.reason === "D" ? <div className="space-y-2 sm:col-span-2">
          <Label htmlFor={`${prefix}-reasonDetail`}>기타 사유</Label>
          <Input id={`${prefix}-reasonDetail`} value={form.reasonDetail} required maxLength={120}
            aria-invalid={Boolean(fieldErrors.reasonDetail)} aria-describedby={fieldErrors.reasonDetail ? `${prefix}-reasonDetail-error` : undefined}
            onChange={(event) => {
              setForm((current) => ({ ...current, reasonDetail: event.target.value }));
              setFieldErrors((current) => ({ ...current, reasonDetail: undefined }));
              setStatus("");
            }} />
          {fieldErrors.reasonDetail ? <p id={`${prefix}-reasonDetail-error`} className="text-sm text-destructive">{fieldErrors.reasonDetail}</p> : null}
        </div> : null}
      </fieldset>
      {form.name.trim() ? <p className="text-sm text-muted-foreground">신청자 서명: <span className="whitespace-pre-wrap">{refundApplicantSignature(form.name)}</span></p> : null}
      <p role="status" className="text-sm text-muted-foreground">{status}</p>
      <p className="text-sm text-muted-foreground">입력한 값은 PDF에만 반영되며, 명단을 옮기려면 ‘환불자로 변경’을 눌러 주세요. PDF가 필요하면 변경 전에 저장해 주세요. 실제 결제 취소는 별도로 진행해야 합니다.</p>
      <DialogFooter className="sm:flex-wrap">
        <Button type="button" variant="ghost" disabled={busy !== null} onClick={() => onBack(form)}>뒤로</Button>
        <Button type="button" variant="destructive" disabled={busy !== null} onClick={() => void perform("refund")}>{busy === "refund" ? <Loader2 className="animate-spin" /> : null}환불자로 변경</Button>
        <Button type="button" variant="outline" disabled={busy !== null} onClick={() => void perform("print")}>{busy === "print" ? <Loader2 className="animate-spin" /> : <Printer />}출력</Button>
        <Button type="submit" disabled={busy !== null}>{busy === "save" ? <Loader2 className="animate-spin" /> : <Download />}PDF 저장</Button>
      </DialogFooter>
    </form>
  );
}
