"use client";

import { useId, useState, type FormEvent } from "react";
import { Loader2, Pencil } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import type { RosterRow } from "@/lib/jobs/types";

type ManualForm = {
  customerName: string;
  phone: string;
  email: string;
  optionName: string;
  referrer: string;
  source: string;
  adMedia: string;
  paymentMethod: string;
  paymentId: string;
  paymentAmount: string;
  rs: string;
  hasDifferentStudent: boolean;
  studentName: string;
  studentPhone: string;
};

type SavedEnrollment = {
  normalizedPhone: string;
  values: RosterRow["values"];
};

export function ManualEnrollmentName({
  jobId,
  enrollmentId,
  normalizedPhone,
  values,
  onSaved,
  paidRoster = false,
}: {
  jobId: string;
  enrollmentId: string;
  normalizedPhone: string;
  values: RosterRow["values"];
  onSaved: (enrollment: SavedEnrollment) => void;
  paidRoster?: boolean;
}) {
  const fieldPrefix = useId();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ManualForm>(() =>
    createForm(normalizedPhone, values),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function setField<K extends keyof ManualForm>(field: K, value: ManualForm[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function handleOpenChange(nextOpen: boolean) {
    if (saving) return;
    setOpen(nextOpen);
    if (nextOpen) setForm(createForm(normalizedPhone, values));
    setError("");
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/jobs/${jobId}/enrollments/${enrollmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(paidRoster ? form : {
          customerName: form.customerName, phone: form.phone, email: form.email, optionName: form.optionName,
          referrer: form.referrer, source: form.source, adMedia: form.adMedia,
        }),
      });
      const body = (await response.json()) as {
        message?: string;
        enrollment?: SavedEnrollment;
      };
      if (!response.ok || !body.enrollment) {
        throw new Error(body.message ?? "수강생 정보를 저장하지 못했습니다.");
      }
      onSaved(body.enrollment);
      setOpen(false);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "수강생 정보를 저장하지 못했습니다.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function markRefunded() {
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/jobs/${jobId}/enrollments/${enrollmentId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refund: true }) });
      const data = await response.json();
      if (!response.ok || !data.enrollment) throw new Error(data.message ?? "환불 상태를 저장하지 못했습니다.");
      onSaved(data.enrollment); setOpen(false);
    } catch (error) { setError(error instanceof Error ? error.message : "환불 상태 저장 실패"); }
    finally { setSaving(false); }
  }

  return (
    <>
      <Button
        type="button"
        variant="link"
        className="h-auto gap-1 p-0 font-medium"
        onClick={() => handleOpenChange(true)}
        aria-label={`${values.customerName || "수강생"} 정보 수정`}
      >
        {values.customerName || "-"}
        <Pencil className="size-3.5" />
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <form onSubmit={save} className="space-y-5">
            <DialogHeader>
              <DialogTitle>수강생 정보 수정</DialogTitle>
              <DialogDescription>
                수강생 정보를 수정하거나 환불자로 표시합니다. 환불 처리는 결제 취소가 아닌 명단 상태 변경입니다.
              </DialogDescription>
            </DialogHeader>
            {error ? (
              <Alert variant="destructive">
                <AlertTitle>저장할 수 없습니다</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                id={`${fieldPrefix}-name`}
                label={paidRoster ? "결제자 이름" : "이름"}
                required
                maxLength={120}
                value={form.customerName}
                onChange={(value) => setField("customerName", value)}
              />
              <FormField
                id={`${fieldPrefix}-phone`}
                label={paidRoster ? "결제자 전화번호" : "연락처"}
                required
                inputMode="tel"
                placeholder="010-0000-0000"
                value={form.phone}
                onChange={(value) => setField("phone", value)}
              />
              <FormField
                id={`${fieldPrefix}-email`}
                label="이메일"
                type="email"
                value={form.email}
                onChange={(value) => setField("email", value)}
              />
              <FormField
                id={`${fieldPrefix}-option`}
                label="옵션명"
                value={form.optionName}
                onChange={(value) => setField("optionName", value)}
              />
              {paidRoster ? <>
                <FormField id={`${fieldPrefix}-rs`} label="RS" value={form.rs} onChange={(value) => setField("rs", value)} />
                <FormField id={`${fieldPrefix}-payment-method`} label="결제방법" value={form.paymentMethod} onChange={(value) => setField("paymentMethod", value)} />
                <FormField id={`${fieldPrefix}-payment-amount`} label="결제금액" inputMode="decimal" value={form.paymentAmount} onChange={(value) => setField("paymentAmount", value)} />
                <FormField id={`${fieldPrefix}-payment-id`} label="결제ID" value={form.paymentId} onChange={(value) => setField("paymentId", value)} />
              </> : <><FormField
                id={`${fieldPrefix}-referrer`}
                label="추천인"
                value={form.referrer}
                onChange={(value) => setField("referrer", value)}
              />
              <FormField
                id={`${fieldPrefix}-source`}
                label="유입 경로"
                value={form.source}
                onChange={(value) => setField("source", value)}
              />
              <FormField
                id={`${fieldPrefix}-ad-media`}
                label="광고 매체"
                value={form.adMedia}
                onChange={(value) => setField("adMedia", value)}
              /></>}
            </div>
            {paidRoster && <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
              <div className="flex items-center gap-2">
                <Checkbox id={`${fieldPrefix}-different-student`} checked={form.hasDifferentStudent} onCheckedChange={(checked) => setField("hasDifferentStudent", checked === true)} />
                <Label htmlFor={`${fieldPrefix}-different-student`}>결제자와 수강생 다름</Label>
              </div>
              {form.hasDifferentStudent ? <>
                <p className="text-sm text-muted-foreground">문자·알림톡은 아래 실제 수강생에게만 발송합니다. 결제자 정보는 결제 내역 확인용으로 보관합니다.</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField id={`${fieldPrefix}-student-name`} label="실제 수강생 이름" required maxLength={120} value={form.studentName} onChange={(value) => setField("studentName", value)} />
                  <FormField id={`${fieldPrefix}-student-phone`} label="실제 수강생 전화번호" required inputMode="tel" placeholder="010-0000-0000" value={form.studentPhone} onChange={(value) => setField("studentPhone", value)} />
                </div>
              </> : <p className="text-sm text-muted-foreground">결제자 본인이 수강하며, 결제자 전화번호로 문자·알림톡을 발송합니다.</p>}
            </div>}
            <DialogFooter>
              <Button type="button" variant="destructive" disabled={saving} onClick={() => void markRefunded()}>환불 처리</Button>
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => handleOpenChange(false)}
              >
                취소
              </Button>
              <Button
                type="submit"
                disabled={saving || !form.customerName.trim() || !form.phone.trim() || (paidRoster && form.hasDifferentStudent && (!form.studentName.trim() || !form.studentPhone.trim()))}
              >
                {saving ? <Loader2 className="animate-spin" /> : null}
                {saving ? "저장 중" : "저장"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function createForm(
  normalizedPhone: string,
  values: RosterRow["values"],
): ManualForm {
  return {
    customerName: values.customerName,
    phone: normalizedPhone,
    email: values.email,
    optionName: values.optionName,
    referrer: values.referrer,
    source: values.source,
    adMedia: values.adMedia,
    rs: values.rs ?? "",
    paymentMethod: values.paymentMethod ?? "",
    paymentId: values.paymentId ?? "",
    paymentAmount: values.paymentAmount ?? "",
    hasDifferentStudent: values.hasDifferentStudent === true,
    studentName: values.studentName ?? "",
    studentPhone: values.studentPhone ?? "",
  };
}

function FormField({
  id,
  label,
  value,
  onChange,
  required = false,
  type = "text",
  inputMode,
  placeholder,
  maxLength,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: "text" | "email";
  inputMode?: "tel" | "decimal";
  placeholder?: string;
  maxLength?: number;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        inputMode={inputMode}
        required={required}
        placeholder={placeholder}
        maxLength={maxLength}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
