"use client";

import { Loader2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { InstructorContractInstructor } from "@/lib/contracts/instructor-contract";
import { normalizeBusinessRegistrationNumber, normalizeInstructorPhone } from "@/lib/contracts/instructor-contract";

const empty = { instructorName: "", address: "", phone: "", email: "" };
const SUPPLIER_FIELDS = [
  { name: "supplyinstructorName", label: "상호", maxLength: 200 },
  { name: "supplyaddress", label: "주소", maxLength: 500, wide: true },
  { name: "supplynumber", label: "사업자등록번호", inputMode: "numeric" as const, maxLength: 12 },
  { name: "supplyceoname", label: "대표자", hint: "서명 또는 인", maxLength: 200 },
  { name: "supplyphone", label: "연락처", inputMode: "numeric" as const, maxLength: 13 },
] as const;

export function InstructorContractInstructorManager({ initialInstructors }: { initialInstructors: InstructorContractInstructor[] }) {
  const [instructors, setInstructors] = useState(initialInstructors);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState("");
  const [error, setError] = useState("");
  const [partyType, setPartyType] = useState<"instructor" | "supplier">("instructor");
  const [details, setDetails] = useState<Record<string, string>>({});
  const supplierName = details.supplyinstructorName?.trim() ?? "";

  function change(key: keyof typeof form, value: string) { setForm((current) => ({ ...current, [key]: value })); }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setError("");
    try {
      if (partyType === "supplier" && !supplierName) throw new Error("상호를 입력해 주세요.");
      const supplierDetails = Object.fromEntries(SUPPLIER_FIELDS.map(({ name }) => [name, details[name] ?? ""]));
      const payload = partyType === "supplier"
        ? { partyType, instructorName: supplierName, address: "", phone: "", email: "", details: supplierDetails }
        : { ...form, partyType, details: {} };
      const response = await fetch("/api/contracts/instructors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
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
      {partyType === "instructor" ? <>
        <div className="space-y-2"><Label htmlFor="contract-instructor-name">강사명</Label><Input id="contract-instructor-name" value={form.instructorName} maxLength={200} required onChange={(event) => change("instructorName", event.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="contract-instructor-phone">연락처</Label><Input id="contract-instructor-phone" type="tel" inputMode="numeric" value={form.phone} maxLength={13} placeholder="010-0000-0000" onChange={(event) => change("phone", normalizeInstructorPhone(event.target.value).slice(0, 13))} /></div>
        <div className="space-y-2 sm:col-span-2"><Label htmlFor="contract-instructor-address">주소</Label><Input id="contract-instructor-address" value={form.address} maxLength={500} onChange={(event) => change("address", event.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="contract-instructor-email">이메일</Label><Input id="contract-instructor-email" type="email" value={form.email} maxLength={320} onChange={(event) => change("email", event.target.value)} /></div>
        <div className="flex items-end justify-end"><Button type="submit" disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <Plus />}저장</Button></div>
      </> : null}
      {partyType === "supplier" ? <>
        {SUPPLIER_FIELDS.map(({ name, label, hint, inputMode, maxLength, wide }) => <div key={name} className={`space-y-2${wide ? " sm:col-span-2" : ""}`}><Label htmlFor={`supplier-detail-${name}`}>{label}{hint ? <span className="ml-1 font-normal text-muted-foreground">({hint})</span> : null}</Label><Input id={`supplier-detail-${name}`} inputMode={inputMode} maxLength={maxLength} value={details[name] ?? ""} onChange={(event) => setDetails((current) => ({ ...current, [name]: name === "supplynumber" ? normalizeBusinessRegistrationNumber(event.target.value) : name === "supplyphone" ? normalizeInstructorPhone(event.target.value).slice(0, 13) : event.target.value }))} /></div>)}
        <div className="flex items-end justify-end"><Button type="submit" disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <Plus />}저장</Button></div>
      </> : null}
    </form>
    {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
    {instructors.length ? <div className="overflow-hidden rounded-xl border bg-card"><ul className="divide-y">{instructors.map((instructor) => <li key={instructor.id} className="flex items-center gap-4 px-5 py-4"><div className="min-w-0 flex-1"><p className="font-semibold">{instructor.instructorName}</p><p className="truncate text-sm text-muted-foreground">{[instructor.phone, instructor.email, instructor.address].filter(Boolean).join(" · ") || "연락처 정보 없음"}</p></div><Button type="button" size="icon-sm" variant="ghost" className="text-destructive" aria-label={`${instructor.instructorName} 삭제`} disabled={deleting === instructor.id} onClick={() => void remove(instructor)}>{deleting === instructor.id ? <Loader2 className="animate-spin" /> : <Trash2 />}</Button></li>)}</ul></div> : <p className="rounded-xl border border-dashed py-16 text-center text-sm text-muted-foreground">저장된 강사 정보가 없습니다.</p>}
  </div>;
}
