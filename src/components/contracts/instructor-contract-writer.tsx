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
  COMPANY_CONTRACT_DETAILS,
  DEFAULT_INSTRUCTOR_CONTRACT_TEMPLATE,
  formatContractNumber,
  getContractEndDate,
  getInstructorContractTemplateVariables,
  normalizeBusinessRegistrationNumber,
  normalizeContractNumberInput,
  normalizeInstructorPhone,
  renderInstructorContractTemplate,
  type InstructorContractTemplateRecord,
  type InstructorContractParty,
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
    customValues: {},
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

const DEFAULT_VARIABLE_LABELS: Record<string, string> = {
  instructorName: "강사명",
  lectureName: "강의명",
  contract_date: "작성 날짜",
  instagram_number_of_reels: "인스타그램 릴스 대행 갯수",
  instagram_value_of_reels: "인스타그램 릴스 대행 금액",
  startDate: "계약 시작일",
  endDate: "계약 종료일",
  contractPeriod: "계약 기간",
  durationYears: "계약 기간(년)",
  address: "강사의 주소",
  phone: "강사의 전화번호",
  email: "강사의 이메일주소",
  companyName: "회사명",
  companyAddress: "회사 주소",
  companyRepresentative: "회사 대표자",
};

export function InstructorContractWriter({
  templates,
  parties,
  initialDraft,
  initialDraftUpdatedAt,
}: {
  templates: InstructorContractTemplateRecord[];
  parties: InstructorContractParty[];
  initialDraft?: InstructorContractValues;
  initialDraftUpdatedAt?: string;
}) {
  const router = useRouter();
  const availableTemplates = templates.length ? templates : [BUILT_IN_TEMPLATE];
  const [selectedTemplateId, setSelectedTemplateId] = useState(availableTemplates[0].id);
  const [selectedInstructorId, setSelectedInstructorId] = useState("");
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [values, setValues] = useState<InstructorContractValues>(() => ({ ...initialValues(), ...initialDraft, customValues: initialDraft?.customValues ?? {} }));
  const [saving, setSaving] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [error, setError] = useState("");
  const [draftStatus, setDraftStatus] = useState(initialDraftUpdatedAt ? "이전에 임시저장한 내용을 불러왔습니다." : "");
  const selectedTemplate = availableTemplates.find((template) => template.id === selectedTemplateId) ?? availableTemplates[0];
  const renderedContent = useMemo(() => renderInstructorContractTemplate(selectedTemplate.template, values), [selectedTemplate.template, values]);
  const templateVariables = useMemo(() => getInstructorContractTemplateVariables(selectedTemplate.template), [selectedTemplate.template]);
  const isSupplierContract = selectedTemplate.name.includes("강사공급사");
  const instructors = parties.filter((party) => party.partyType === "instructor");
  const suppliers = parties.filter((party) => party.partyType === "supplier");

  function updateTemplateVariable(variable: string, value: string) {
    const normalizedValue = /(?:business.*(?:number|registration)|business_number|businessRegistrationNumber)/iu.test(variable)
      ? normalizeBusinessRegistrationNumber(value)
      : variable === "instagram_value_of_reels"
        ? normalizeContractNumberInput(value)
        : /(?:phone|tel)/iu.test(variable)
          ? normalizeInstructorPhone(value).slice(0, 13)
          : variable === "instagram_number_of_reels"
            ? normalizeContractNumberInput(value)
        : value;
    setValues((current) => ({
      ...current,
      customValues: { ...current.customValues, [variable]: normalizedValue },
      ...(variable === "instructorName" ? { instructorName: normalizedValue } : {}),
      ...(variable === "lectureName" ? { lectureName: normalizedValue } : {}),
      ...(variable === "address" ? { address: normalizedValue } : {}),
      ...(variable === "phone" ? { phone: normalizedValue } : {}),
      ...(variable === "email" ? { email: normalizedValue } : {}),
    }));
  }

  function inputOptions(variable: string, label?: string) {
    if (variable === "contract_date" || /계약\s*일|계약\s*날짜|작성\s*일/u.test(label ?? "")) return { type: "date" as const };
    if (variable === "instagram_number_of_reels" || variable === "instagram_value_of_reels") return { inputMode: "numeric" as const };
    if (/(?:business.*(?:number|registration)|business_number|businessRegistrationNumber)/iu.test(variable) || /사업자등록번호/u.test(label ?? "")) return { inputMode: "numeric" as const, maxLength: 12 };
    if (/(?:phone|tel)/iu.test(variable) || /전화번호/u.test(label ?? "")) return { type: "tel" as const, inputMode: "numeric" as const, maxLength: 13 };
    return {};
  }

  function variableInputValue(variable: string) {
    if (variable in values.customValues) {
      const value = values.customValues[variable] ?? "";
      return variable === "instagram_value_of_reels" ? formatContractNumber(value) : value;
    }
    const endDate = getContractEndDate(values.startDate, values.durationYears);
    const defaults: Record<string, string> = {
      instructorName: values.instructorName,
      lectureName: values.lectureName,
      contract_date: values.contractDate,
      instagram_number_of_reels: values.instagramNumberOfReels,
      instagram_value_of_reels: formatContractNumber(values.instagramValueOfReels),
      startDate: values.startDate,
      endDate,
      contractPeriod: `${values.startDate} ~ ${endDate} (${values.durationYears}년간)`,
      durationYears: String(values.durationYears),
      address: values.address,
      phone: values.phone,
      email: values.email,
      companyName: COMPANY_CONTRACT_DETAILS.name,
      companyAddress: COMPANY_CONTRACT_DETAILS.address,
      companyRepresentative: COMPANY_CONTRACT_DETAILS.representative,
    };
    return defaults[variable] ?? "";
  }

  function updateContractPeriod(key: "startDate" | "durationYears", value: string) {
    setValues((current) => ({
      ...current,
      [key]: key === "durationYears" ? Math.max(1, Math.min(20, Number(value) || 1)) : value,
      customValues: Object.fromEntries(Object.entries(current.customValues).filter(([variable]) => variable !== "contractPeriod")),
    }));
  }

  function selectTemplate(templateId: string) {
    setSelectedTemplateId(templateId);
    setValues(initialValues());
    setError("");
    setDraftStatus("");
    setSelectedInstructorId("");
    setSelectedSupplierId("");
  }

  function applyParty(party: InstructorContractParty) {
    setValues((current) => ({
      ...current,
      instructorName: party.partyType === "instructor" ? party.instructorName : current.instructorName,
      address: party.partyType === "instructor" ? party.address : current.address,
      phone: party.partyType === "instructor" ? party.phone : current.phone,
      email: party.partyType === "instructor" ? party.email : current.email,
      customValues: {
        ...current.customValues,
        ...party.details,
        ...(party.partyType === "instructor" ? { instructorName: party.instructorName, address: party.address, phone: party.phone, email: party.email } : {}),
      },
    }));
  }

  function selectInstructor(instructorId: string) {
    setSelectedInstructorId(instructorId);
    const instructor = instructors.find((item) => item.id === instructorId);
    if (!instructor) return;
    applyParty(instructor);
  }

  function selectSupplier(supplierId: string) {
    setSelectedSupplierId(supplierId);
    const supplier = suppliers.find((item) => item.id === supplierId);
    if (supplier) applyParty(supplier);
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
              <Label htmlFor="contract-template">계약서 템플릿</Label>
              <Select value={selectedTemplate.id} onValueChange={selectTemplate}>
                <SelectTrigger id="contract-template"><SelectValue /></SelectTrigger>
                <SelectContent>{availableTemplates.map((template) => <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>)}</SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">템플릿을 바꾸면 아래 입력값이 초기화됩니다.</p>
            </div>
            {isSupplierContract ? <div className="space-y-2">
              <Label htmlFor="contract-supplier-saved">강사공급사 정보</Label>
              <Select value={selectedSupplierId || "none"} onValueChange={(value) => selectSupplier(value === "none" ? "" : value)}>
                <SelectTrigger id="contract-supplier-saved"><SelectValue placeholder="강사공급사 선택" /></SelectTrigger>
                <SelectContent><SelectItem value="none">선택 안 함</SelectItem>{suppliers.map((supplier) => <SelectItem key={supplier.id} value={supplier.id}>{supplier.instructorName}</SelectItem>)}</SelectContent>
              </Select>
            </div> : null}
            <div className="space-y-2">
              <Label htmlFor="contract-instructor-saved">저장된 강사 정보</Label>
              <Select value={selectedInstructorId || "none"} onValueChange={(value) => selectInstructor(value === "none" ? "" : value)}>
                <SelectTrigger id="contract-instructor-saved"><SelectValue placeholder="강사 정보 선택" /></SelectTrigger>
                <SelectContent><SelectItem value="none">선택 안 함</SelectItem>{instructors.map((instructor) => <SelectItem key={instructor.id} value={instructor.id}>{instructor.instructorName}</SelectItem>)}</SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">선택하면 강사명, 주소, 연락처, 이메일을 입력합니다.</p>
            </div>
            {templateVariables.map(({ name, label }) => name === "contractPeriod" ? <div key={name} className="space-y-2"><Label>{label || DEFAULT_VARIABLE_LABELS[name]}</Label><div className="grid grid-cols-[1fr_7rem] gap-2"><Input aria-label="계약 시작일" type="date" value={values.startDate} onChange={(event) => updateContractPeriod("startDate", event.target.value)} /><Input aria-label="계약 기간(년)" type="number" min="1" max="20" value={values.durationYears} onChange={(event) => updateContractPeriod("durationYears", event.target.value)} /></div><p className="text-xs text-muted-foreground">{variableInputValue(name)}</p></div> : <div key={name} className="space-y-2"><Label htmlFor={`contract-variable-${name}`}>{label || DEFAULT_VARIABLE_LABELS[name] || `변수: ${name}`}</Label><Input id={`contract-variable-${name}`} maxLength={10_000} {...inputOptions(name, label)} value={variableInputValue(name)} onChange={(event) => updateTemplateVariable(name, event.target.value)} /></div>)}
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

