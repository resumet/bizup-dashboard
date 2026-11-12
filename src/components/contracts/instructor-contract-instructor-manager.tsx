"use client";

import { Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  normalizeBusinessRegistrationNumber,
  normalizeInstructorPhone,
  type InstructorContractParty,
} from "@/lib/contracts/instructor-contract";

const empty = { instructorName: "", address: "", phone: "", email: "" };

type SupplierField = {
  name: "supplyinstructorName" | "supplyaddress" | "supplynumber" | "supplyceoname" | "supplyphone" | "supplyemail";
  label: string;
  maxLength: number;
  hint?: string;
  inputMode?: "numeric";
  type?: "email";
  wide?: boolean;
};

const SUPPLIER_FIELDS: SupplierField[] = [
  { name: "supplyinstructorName", label: "상호", maxLength: 200 },
  { name: "supplyaddress", label: "주소", maxLength: 500, wide: true },
  { name: "supplynumber", label: "사업자등록번호", inputMode: "numeric", maxLength: 12 },
  { name: "supplyceoname", label: "대표자", hint: "서명 또는 인", maxLength: 200 },
  { name: "supplyphone", label: "연락처", inputMode: "numeric", maxLength: 13 },
  { name: "supplyemail", label: "이메일", type: "email", maxLength: 320 },
];

function partyLabel(partyType: InstructorContractParty["partyType"]) {
  return partyType === "supplier" ? "강사공급사 정보" : "강사 정보";
}

function partySummary(party: InstructorContractParty) {
  const values = party.partyType === "supplier"
    ? [party.details.supplyphone, party.details.supplyemail, party.details.supplyaddress]
    : [party.phone, party.email, party.address];
  return values.filter(Boolean).join(" · ") || "연락처 정보 없음";
}

export function InstructorContractInstructorManager({ initialParties }: { initialParties: InstructorContractParty[] }) {
  const [parties, setParties] = useState(initialParties);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState("");
  const [error, setError] = useState("");
  const [partyType, setPartyType] = useState<InstructorContractParty["partyType"]>("instructor");
  const [details, setDetails] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<InstructorContractParty | null>(null);
  const supplierName = details.supplyinstructorName?.trim() ?? "";

  function resetForm() {
    setForm(empty);
    setDetails({});
    setPartyType("instructor");
    setEditing(null);
  }

  function change(key: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function startEdit(party: InstructorContractParty) {
    setError("");
    setEditing(party);
    setPartyType(party.partyType);
    setForm({ instructorName: party.instructorName, address: party.address, phone: party.phone, email: party.email });
    setDetails(party.details);
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      if (partyType === "supplier" && !supplierName) throw new Error("상호를 입력해 주세요.");
      const supplierDetails = Object.fromEntries(SUPPLIER_FIELDS.map(({ name }) => [name, details[name] ?? ""]));
      const payload = partyType === "supplier"
        ? { partyType, instructorName: supplierName, address: "", phone: "", email: "", details: supplierDetails }
        : { ...form, partyType, details: {} };
      const response = await fetch(editing ? `/api/contracts/instructors/${editing.id}` : "/api/contracts/instructors", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json() as { instructor?: InstructorContractParty; message?: string };
      if (!response.ok || !result.instructor) throw new Error(result.message ?? "거래처 정보를 저장하지 못했습니다.");
      setParties((current) => {
        const next = editing
          ? current.map((party) => party.id === editing.id ? result.instructor! : party)
          : [...current, result.instructor!];
        return next.sort((left, right) => left.instructorName.localeCompare(right.instructorName, "ko"));
      });
      resetForm();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "거래처 정보를 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(party: InstructorContractParty) {
    if (deleting || !window.confirm(`${party.instructorName} 거래처 정보를 삭제할까요?`)) return;
    setDeleting(party.id);
    setError("");
    try {
      const response = await fetch(`/api/contracts/instructors/${party.id}`, { method: "DELETE" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { message?: string };
        throw new Error(body.message ?? "거래처 정보를 삭제하지 못했습니다.");
      }
      setParties((current) => current.filter((item) => item.id !== party.id));
      if (editing?.id === party.id) resetForm();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "거래처 정보를 삭제하지 못했습니다.");
    } finally {
      setDeleting("");
    }
  }

  return <div className="space-y-6">
    <form className="grid gap-4 rounded-xl border bg-card p-5 sm:grid-cols-2" onSubmit={save}>
      <div className="flex items-center justify-between gap-3 sm:col-span-2">
        <p className="font-semibold">{editing ? "거래처 정보 수정" : "거래처 정보 등록"}</p>
        {editing ? <Button type="button" variant="ghost" size="sm" onClick={resetForm}><X aria-hidden="true" />취소</Button> : null}
      </div>
      <div className="space-y-2"><Label>거래처 유형</Label><Select value={partyType} onValueChange={(value) => setPartyType(value as InstructorContractParty["partyType"])}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="instructor">강사 정보</SelectItem><SelectItem value="supplier">강사공급사 정보</SelectItem></SelectContent></Select></div>
      {partyType === "instructor" ? <>
        <div className="space-y-2"><Label htmlFor="contract-instructor-name">강사명</Label><Input id="contract-instructor-name" value={form.instructorName} maxLength={200} required onChange={(event) => change("instructorName", event.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="contract-instructor-phone">연락처</Label><Input id="contract-instructor-phone" type="tel" inputMode="numeric" value={form.phone} maxLength={13} placeholder="010-0000-0000" onChange={(event) => change("phone", normalizeInstructorPhone(event.target.value).slice(0, 13))} /></div>
        <div className="space-y-2 sm:col-span-2"><Label htmlFor="contract-instructor-address">주소</Label><Input id="contract-instructor-address" value={form.address} maxLength={500} onChange={(event) => change("address", event.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="contract-instructor-email">이메일</Label><Input id="contract-instructor-email" type="email" value={form.email} maxLength={320} onChange={(event) => change("email", event.target.value)} /></div>
      </> : null}
      {partyType === "supplier" ? SUPPLIER_FIELDS.map(({ name, label, hint, inputMode, type, maxLength, wide }) => <div key={name} className={`space-y-2${wide ? " sm:col-span-2" : ""}`}><Label htmlFor={`supplier-detail-${name}`}>{label}{hint ? <span className="ml-1 font-normal text-muted-foreground">({hint})</span> : null}</Label><Input id={`supplier-detail-${name}`} type={type} inputMode={inputMode} maxLength={maxLength} value={details[name] ?? ""} onChange={(event) => setDetails((current) => ({ ...current, [name]: name === "supplynumber" ? normalizeBusinessRegistrationNumber(event.target.value) : name === "supplyphone" ? normalizeInstructorPhone(event.target.value).slice(0, 13) : event.target.value }))} /></div>) : null}
      <div className="flex items-end justify-end sm:col-span-2"><Button type="submit" disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : editing ? <Pencil /> : <Plus />}{editing ? "수정 저장" : "저장"}</Button></div>
    </form>
    {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
    {parties.length ? <div className="overflow-hidden rounded-xl border bg-card"><ul className="divide-y">{parties.map((party) => <li key={party.id} className="flex items-center gap-4 px-5 py-4"><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="truncate font-semibold">{party.instructorName}</p><Badge variant="secondary">{partyLabel(party.partyType)}</Badge></div><p className="truncate text-sm text-muted-foreground">{partySummary(party)}</p></div><Button type="button" size="icon-sm" variant="ghost" aria-label={`${party.instructorName} 수정`} onClick={() => startEdit(party)}><Pencil /></Button><Button type="button" size="icon-sm" variant="ghost" className="text-destructive" aria-label={`${party.instructorName} 삭제`} disabled={deleting === party.id} onClick={() => void remove(party)}>{deleting === party.id ? <Loader2 className="animate-spin" /> : <Trash2 />}</Button></li>)}</ul></div> : <p className="rounded-xl border border-dashed py-16 text-center text-sm text-muted-foreground">등록된 거래처 정보가 없습니다.</p>}
  </div>;
}
