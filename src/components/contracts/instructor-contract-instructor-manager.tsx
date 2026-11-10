"use client";

import { Loader2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { InstructorContractInstructor, InstructorContractTemplateRecord } from "@/lib/contracts/instructor-contract";
import { getInstructorContractTemplateVariables, normalizeInstructorPhone } from "@/lib/contracts/instructor-contract";

const empty = { instructorName: "", address: "", phone: "", email: "" };

export function InstructorContractInstructorManager({ initialInstructors, templates }: { initialInstructors: InstructorContractInstructor[]; templates: InstructorContractTemplateRecord[] }) {
  const [instructors, setInstructors] = useState(initialInstructors);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState("");
  const [error, setError] = useState("");
  const [partyType, setPartyType] = useState<"instructor" | "supplier">("instructor");
  const [supplierTemplateId, setSupplierTemplateId] = useState("");
  const [details, setDetails] = useState<Record<string, string>>({});
  const supplierTemplates = templates.filter((template) => template.name.includes("강사공급사"));
  const supplierTemplate = supplierTemplates.find((template) => template.id === supplierTemplateId);

  function change(key: keyof typeof form, value: string) { setForm((current) => ({ ...current, [key]: value })); }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/contracts/instructors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, partyType, details }) });
      const result = await response.json() as { instructor?: InstructorContractInstructor; message?: string };
      if (!response.ok || !result.instructor) throw new Error(result.message ?? "강사 정보를 저장하지 못했습니다.");
      setInstructors((current) => [...current, result.instructor!].sort((left, right) => left.instructorName.localeCompare(right.instructorName, "ko")));
      setForm(empty); setDetails({});
    } catch (caught) { setError(caught instanceof Error ? caught.message : "강사 정보를 저장하지 못했습니다."); }
    finally { setSaving(false); }
  }
  async function remove(instructor: InstructorContractInstructor) {
    if (deleting || !window.confirm(`“${instructor.instructorName}” 강사 정보를 삭제할까요?`)) return;
    setDeleting(instructor.id); setError("");
    try {
      const response = await fetch(`/api/contracts/instructors/${instructor.id}`, { method: "DELETE" });
      if (!response.ok) { const body = await response.json().catch(() => ({})) as { message?: string }; throw new Error(body.message ?? "강사 정보를 삭제하지 못했습니다."); }
      setInstructors((current) => current.filter((item) => item.id !== instructor.id));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "강사 정보를 삭제하지 못했습니다."); }
    finally { setDeleting(""); }
  }
  return <div className="space-y-6">
    <form className="grid gap-4 rounded-xl border bg-card p-5 sm:grid-cols-2" onSubmit={save}>
      <div className="space-y-2"><Label>거래처 유형</Label><Select value={partyType} onValueChange={(value) => setPartyType(value as "instructor" | "supplier")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="instructor">강사정보</SelectItem><SelectItem value="supplier">강사공급사정보</SelectItem></SelectContent></Select></div>
      {partyType === "supplier" ? <div className="space-y-2"><Label>강사공급사 계약서 템플릿</Label><Select value={supplierTemplateId} onValueChange={setSupplierTemplateId}><SelectTrigger><SelectValue placeholder="템플릿 선택" /></SelectTrigger><SelectContent>{supplierTemplates.map((template) => <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>)}</SelectContent></Select></div> : null}
      <div className="space-y-2"><Label htmlFor="contract-instructor-name">{partyType === "supplier" ? "강사공급사명" : "강사명"}</Label><Input id="contract-instructor-name" value={form.instructorName} maxLength={200} required onChange={(event) => change("instructorName", event.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor="contract-instructor-phone">연락처</Label><Input id="contract-instructor-phone" type="tel" inputMode="numeric" value={form.phone} maxLength={13} placeholder="010-0000-0000" onChange={(event) => change("phone", normalizeInstructorPhone(event.target.value).slice(0, 13))} /></div>
      <div className="space-y-2 sm:col-span-2"><Label htmlFor="contract-instructor-address">주소</Label><Input id="contract-instructor-address" value={form.address} maxLength={500} onChange={(event) => change("address", event.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor="contract-instructor-email">이메일</Label><Input id="contract-instructor-email" type="email" value={form.email} maxLength={320} onChange={(event) => change("email", event.target.value)} /></div>
      <div className="flex items-end justify-end"><Button type="submit" disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <Plus />}저장</Button></div>
      {partyType === "supplier" && supplierTemplate ? getInstructorContractTemplateVariables(supplierTemplate.template).map(({ name, label }) => <div key={name} className="space-y-2"><Label htmlFor={`supplier-detail-${name}`}>{label || `변수: ${name}`}</Label><Input id={`supplier-detail-${name}`} value={details[name] ?? ""} onChange={(event) => setDetails((current) => ({ ...current, [name]: event.target.value }))} /></div>) : null}
    </form>
    {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
    {instructors.length ? <div className="overflow-hidden rounded-xl border bg-card"><ul className="divide-y">{instructors.map((instructor) => <li key={instructor.id} className="flex items-center gap-4 px-5 py-4"><div className="min-w-0 flex-1"><p className="font-semibold">{instructor.instructorName}</p><p className="truncate text-sm text-muted-foreground">{[instructor.phone, instructor.email, instructor.address].filter(Boolean).join(" · ") || "연락처 정보 없음"}</p></div><Button type="button" size="icon-sm" variant="ghost" className="text-destructive" aria-label={`${instructor.instructorName} 삭제`} disabled={deleting === instructor.id} onClick={() => void remove(instructor)}>{deleting === instructor.id ? <Loader2 className="animate-spin" /> : <Trash2 />}</Button></li>)}</ul></div> : <p className="rounded-xl border border-dashed py-16 text-center text-sm text-muted-foreground">저장된 강사 정보가 없습니다.</p>}
  </div>;
}
