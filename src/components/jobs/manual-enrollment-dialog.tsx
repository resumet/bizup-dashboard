"use client";

import { useId, useState, type FormEvent } from "react";
import { Loader2, UserPlus } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { RosterRow } from "@/lib/jobs/types";

type ManualForm = {
  customerName: string;
  phone: string;
  email: string;
  optionName: string;
  referrer: string;
  source: string;
  adMedia: string;
};

const EMPTY_FORM: ManualForm = {
  customerName: "",
  phone: "",
  email: "",
  optionName: "",
  referrer: "",
  source: "",
  adMedia: "",
};

export function ManualEnrollmentDialog({
  jobId,
  courseName,
  onAdded,
}: {
  jobId: string;
  courseName: string;
  onAdded: (row: RosterRow) => void;
}) {
  const fieldPrefix = useId();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ManualForm>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function setField(field: keyof ManualForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function handleOpenChange(nextOpen: boolean) {
    if (submitting) return;
    setOpen(nextOpen);
    if (!nextOpen) {
      setForm(EMPTY_FORM);
      setError("");
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(`/api/jobs/${jobId}/enrollments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = (await response.json()) as {
        message?: string;
        enrollment?: RosterRow;
      };
      if (!response.ok || !body.enrollment) {
        throw new Error(body.message ?? "수강생을 추가하지 못했습니다.");
      }
      onAdded(body.enrollment);
      setOpen(false);
      setForm(EMPTY_FORM);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "수강생을 추가하지 못했습니다.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <UserPlus />
          수강생 수동 추가
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <form onSubmit={submit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>수강생 수동 추가</DialogTitle>
            <DialogDescription>
              {courseName
                ? `${courseName} 명단에 수강생 한 명을 추가합니다.`
                : "현재 명단에 수강생 한 명을 추가합니다."}
            </DialogDescription>
          </DialogHeader>

          {error ? (
            <Alert variant="destructive">
              <AlertTitle>추가할 수 없습니다</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              id={`${fieldPrefix}-name`}
              label="이름"
              required
              value={form.customerName}
              onChange={(value) => setField("customerName", value)}
            />
            <FormField
              id={`${fieldPrefix}-phone`}
              label="연락처"
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
            <FormField
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
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={submitting}
            >
              취소
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Loader2 className="animate-spin" /> : <UserPlus />}
              {submitting ? "추가 중" : "명단에 추가"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
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
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: "text" | "email";
  inputMode?: "tel";
  placeholder?: string;
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
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
