"use client";

import { Loader2, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { InstructorContractDocument } from "@/components/contracts/instructor-contract-document";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  BUILT_IN_INSTRUCTOR_CONTRACT_TEMPLATE_ID,
  DEFAULT_INSTRUCTOR_CONTRACT_TEMPLATE,
  formatContractAmountInKorean,
  formatContractNumber,
  getContractEndDate,
  getKoreanDate,
  normalizeContractNumberInput,
  renderInstructorContractTemplate,
  type InstructorContractTemplateRecord,
  type InstructorContractInstructor,
  type InstructorContractValues,
} from "@/lib/contracts/instructor-contract";

function todayInSeoul() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}

function initialValues(): InstructorContractValues {
  return {
    instructorName: "",
    lectureName: "",
    instagramNumberOfReels: "",
    instagramValueOfReels: "",
    contractDate: todayInSeoul(),
    startDate: todayInSeoul(),
    durationYears: 1,
    address: "",
    phone: "",
    email: "",
  };
}

const BUILT_IN_TEMPLATE: InstructorContractTemplateRecord = {
  id: BUILT_IN_INSTRUCTOR_CONTRACT_TEMPLATE_ID,
  name: "기본 계약서",
  template: DEFAULT_INSTRUCTOR_CONTRACT_TEMPLATE,
  createdAt: null,
  updatedAt: null,
  isBuiltIn: true,
};

export function InstructorContractWriter({
  templates,
  instructors,
  initialDraft,
  initialDraftUpdatedAt,
}: {
  templates: InstructorContractTemplateRecord[];
  instructors: InstructorContractInstructor[];
  initialDraft?: InstructorContractValues;
  initialDraftUpdatedAt?: string;
}) {
  const router = useRouter();
  const availableTemplates = templates.length ? templates : [BUILT_IN_TEMPLATE];
  const [selectedTemplateId, setSelectedTemplateId] = useState(availableTemplates[0].id);
  const [selectedInstructorId, setSelectedInstructorId] = useState("");
  const [values, setValues] = useState<InstructorContractValues>(() => ({ ...initialValues(), ...initialDraft }));
  const [saving, setSaving] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [error, setError] = useState("");
  const [draftStatus, setDraftStatus] = useState(initialDraftUpdatedAt ? "이전에 임시저장한 내용을 불러왔습니다." : "");
  const selectedTemplate = availableTemplates.find((template) => template.id === selectedTemplateId) ?? availableTemplates[0];
  const renderedContent = useMemo(() => renderInstructorContractTemplate(selectedTemplate.template, values), [selectedTemplate.template, values]);
  const endDate = useMemo(() => getContractEndDate(values.startDate, values.durationYears), [values.durationYears, values.startDate]);
  const koreanInstagramAmount = formatContractAmountInKorean(values.instagramValueOfReels);

  function update<K extends keyof InstructorContractValues>(key: K, value: InstructorContractValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function selectTemplate(templateId: string) {
    setSelectedTemplateId(templateId);
    setValues(initialValues());
    setError("");
    setDraftStatus("");
  }

  function selectInstructor(instructorId: string) {
    setSelectedInstructorId(instructorId);
    const instructor = instructors.find((item) => item.id === instructorId);
    if (!instructor) return;
    setValues((current) => ({ ...current, instructorName: instructor.instructorName, address: instructor.address, phone: instructor.phone, email: instructor.email }));
  }

  async function saveDraft() {
    setSavingDraft(true);
    setDraftStatus("");
    try {
      const response = await fetch("/api/contracts/draft", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const result = await response.json() as { message?: string };
      if (!response.ok) throw new Error(result.message || "임시저장하지 못했습니다.");
      setDraftStatus("임시저장했습니다. 다음에 다시 열면 이어서 작성할 수 있습니다.");
    } catch (caught) {
      setDraftStatus(caught instanceof Error ? caught.message : "임시저장하지 못했습니다.");
    } finally {
      setSavingDraft(false);
    }
  }

  async function saveContract() {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: selectedTemplate.id, values }),
      });
      const result = await response.json() as { id?: string; message?: string };
      if (!response.ok || !result.id) throw new Error(result.message || "계약서를 저장하지 못했습니다.");
      router.push(`/services/contracts/${result.id}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "계약서를 저장하지 못했습니다.");
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="button" variant="outline" disabled={savingDraft} onClick={() => void saveDraft()}>
          {savingDraft ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Save aria-hidden="true" />}
          {savingDraft ? "임시저장 중" : "임시저장"}
        </Button>
        <Button type="button" disabled={saving} onClick={() => void saveContract()}>
          {saving ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Save aria-hidden="true" />}
          {saving ? "저장 중" : "계약서 저장"}
        </Button>
      </div>

      {draftStatus ? <p className="text-right text-sm text-muted-foreground" role="status">{draftStatus}</p> : null}
      {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}

      <div className="grid items-start gap-5 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <Card className="xl:sticky xl:top-21">
          <CardHeader><CardTitle>계약 정보 입력</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="contract-instructor-saved">저장된 강사 정보</Label>
              <Select value={selectedInstructorId || "none"} onValueChange={(value) => selectInstructor(value === "none" ? "" : value)}>
                <SelectTrigger id="contract-instructor-saved"><SelectValue placeholder="강사 정보 선택" /></SelectTrigger>
                <SelectContent><SelectItem value="none">선택 안 함</SelectItem>{instructors.map((instructor) => <SelectItem key={instructor.id} value={instructor.id}>{instructor.instructorName}</SelectItem>)}</SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">선택하면 강사명, 주소, 연락처, 이메일을 입력합니다.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="contract-template">계약서 템플릿</Label>
              <Select value={selectedTemplate.id} onValueChange={selectTemplate}>
                <SelectTrigger id="contract-template"><SelectValue /></SelectTrigger>
                <SelectContent>{availableTemplates.map((template) => <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>)}</SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">템플릿을 바꾸면 아래 입력값이 초기화됩니다.</p>
            </div>
            <div className="space-y-2"><Label htmlFor="contract-instructor">강사명</Label><Input id="contract-instructor" maxLength={200} value={values.instructorName} onChange={(event) => update("instructorName", event.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="contract-lecture">강의명</Label><Input id="contract-lecture" maxLength={200} value={values.lectureName} onChange={(event) => update("lectureName", event.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="contract-date">작성 날짜</Label><Input id="contract-date" type="date" value={values.contractDate} onChange={(event) => update("contractDate", event.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="contract-instagram-number-of-reels">인스타그램 릴스 대행 갯수</Label><Input id="contract-instagram-number-of-reels" type="text" inputMode="numeric" maxLength={6} placeholder="예: 10" value={values.instagramNumberOfReels} onChange={(event) => update("instagramNumberOfReels", normalizeContractNumberInput(event.target.value).slice(0, 6))} /></div>
            <div className="space-y-2">
              <Label htmlFor="contract-instagram-value-of-reels">인스타그램 릴스 대행 금액</Label>
              <Input id="contract-instagram-value-of-reels" type="text" inputMode="numeric" maxLength={32} placeholder="예: 1,000,000" aria-describedby="contract-instagram-value-of-reels-korean" value={formatContractNumber(values.instagramValueOfReels)} onChange={(event) => update("instagramValueOfReels", normalizeContractNumberInput(event.target.value).slice(0, 24))} />
              <p id="contract-instagram-value-of-reels-korean" className="text-xs text-muted-foreground">{koreanInstagramAmount || "금액을 입력하면 한글로 표시됩니다."}</p>
            </div>
            <div className="space-y-2"><Label htmlFor="contract-start">계약 시작일</Label><Input id="contract-start" type="date" value={values.startDate} onChange={(event) => update("startDate", event.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="contract-duration">계약 기간</Label><Input id="contract-duration" type="number" min="1" max="20" value={values.durationYears} onChange={(event) => update("durationYears", Math.max(1, Math.min(20, Number(event.target.value) || 1)))} /><p className="text-xs text-muted-foreground">종료일: {getKoreanDate(endDate)}</p></div>
            <div className="space-y-2"><Label htmlFor="contract-address">강사의 주소</Label><Input id="contract-address" maxLength={500} value={values.address} onChange={(event) => update("address", event.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="contract-phone">강사의 전화번호</Label><Input id="contract-phone" type="tel" maxLength={100} value={values.phone} onChange={(event) => update("phone", event.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="contract-email">강사의 이메일주소</Label><Input id="contract-email" type="email" maxLength={320} value={values.email} onChange={(event) => update("email", event.target.value)} /></div>
          </CardContent>
        </Card>

        <section className="overflow-hidden rounded-xl border bg-slate-100 shadow-sm" aria-label="계약서 미리보기">
          <div className="flex items-center justify-between border-b bg-white px-5 py-3"><h2 className="font-semibold">계약서 전문</h2><span className="text-xs text-muted-foreground">입력 내용이 즉시 반영됩니다.</span></div>
          <div className="max-h-[calc(100dvh-12rem)] min-h-[42rem] overflow-y-auto p-3 sm:p-6"><div><InstructorContractDocument content={renderedContent} /></div></div>
        </section>
      </div>
    </div>
  );
}

