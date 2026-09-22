"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Eye, EyeOff, Plus, RefreshCw, Save, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { actionLabels, statusLabels, type PersonnelDetail, type PersonnelList } from "@/lib/personnel/model";

const api = "/api/hr/personnel";
const selectClass = "h-10 w-full min-w-0 rounded-md border bg-background px-3 text-sm";
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="grid min-w-0 gap-2 text-sm font-medium"><span>{label}</span>{children}</label>; }
function ErrorMessage({ message }: { message: string }) { return message ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{message}</p> : null; }
async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message ?? "요청을 처리하지 못했습니다.");
  return data as T;
}
function post<T>(body: unknown) { return request<T>(api, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); }

function EmployeeForm({ detail, accounts, today, saved, busyChanged }: { detail?: PersonnelDetail; accounts: PersonnelList["accounts"]; today: string; saved: () => void; busyChanged: (value: boolean) => void }) {
  const person = detail?.employee;
  const [action, setAction] = useState(person ? "update" : "hire");
  const [account, setAccount] = useState(person?.user_id ?? "");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState("");
  const [resident, setResident] = useState("");
  const [changed, setChanged] = useState(false);
  const [visible, setVisible] = useState(false);
  const [revealed, setRevealed] = useState("");
  const [revealing, setRevealing] = useState(false);
  useEffect(() => {
    if (!visible) return;
    const timeout = setTimeout(() => { setVisible(false); setRevealed(""); }, 30000);
    return () => clearTimeout(timeout);
  }, [visible]);
  async function reveal() {
    if (visible) { setVisible(false); setRevealed(""); return; }
    if (changed) { setVisible(true); return; }
    if (!person) return;
    setRevealing(true); setError("");
    try { const data = await post<{ resident_number: string }>({ action: "reveal", id: person.id }); setRevealed(data.resident_number); setVisible(true); }
    catch (error) { setError(error instanceof Error ? error.message : "주민번호 조회에 실패했습니다."); }
    finally { setRevealing(false); }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); busyChanged(true); setError("");
    const form = new FormData(event.currentTarget);
    const text = (key: string) => String(form.get(key) ?? "");
    try {
      await post({ action, ...(person ? { id: person.id, expected_version: person.version } : {}), user_id: account || null,
        email: accounts.find(item => item.id === account)?.email ?? person?.email ?? text("email"), name: text("name"), address: text("address"), phone: text("phone"), memo: text("memo"),
        employment_start_date: text("start"), contract_end_date: text("contract") || null, annual_salary: text("salary") === "" ? null : Number(text("salary")),
        bank_name: text("bank_name"), bank_account: text("bank_account"),
        effective_date: action === "hire" || action === "rehire" ? text("start") : text("effective"), reason: text("reason"),
        ...(changed ? { resident_number: resident } : {}),
      });
      setResident(""); setRevealed(""); saved();
    } catch (error) { setError(error instanceof Error ? error.message : "저장하지 못했습니다."); }
    finally { inFlight.current = false; setBusy(false); busyChanged(false); }
  }
  return <form className="space-y-5" onSubmit={save}>
    <fieldset disabled={busy} className="grid min-w-0 gap-4 sm:grid-cols-2">
      <Field label="이름"><Input name="name" required maxLength={100} defaultValue={person?.name} autoComplete="off" /></Field>
      <Field label="직원 계정"><select className={selectClass} value={account} disabled={Boolean(person?.user_id)} onChange={event => setAccount(event.target.value)}><option value="">계정 미연결</option>{person?.user_id && <option value={person.user_id}>{person.email}</option>}{accounts.map(item => <option key={item.id} value={item.id}>{item.email}</option>)}</select></Field>
      <Field label="이메일"><Input key={account} name="email" type="email" required readOnly={Boolean(account || person)} defaultValue={accounts.find(item => item.id === account)?.email ?? person?.email ?? ""} maxLength={254} /></Field>
      <Field label="전화번호"><Input name="phone" type="tel" defaultValue={person?.phone} maxLength={40} /></Field>
      <div className="sm:col-span-2"><Field label="주소"><Input name="address" defaultValue={person?.address} maxLength={500} autoComplete="off" /></Field></div>
      <div className="space-y-2 sm:col-span-2"><label htmlFor="personnel-resident" className="text-sm font-medium">주민등록번호</label><div className="flex gap-2">
        <Input id="personnel-resident" type={visible ? "text" : "password"} autoComplete="off" maxLength={14} placeholder={person?.has_resident_number ? "등록됨 · 변경 시 입력" : "미등록"} value={changed ? resident : visible ? revealed : ""} onChange={event => { setResident(event.target.value); setChanged(true); }} />
        <Button type="button" size="icon" variant="outline" disabled={revealing || (!changed && !person?.has_resident_number)} title={visible ? "주민번호 숨기기" : "주민번호 보기"} aria-label={visible ? "주민번호 숨기기" : "주민번호 보기"} onClick={reveal}>{visible ? <EyeOff /> : <Eye />}</Button>
        <Button type="button" size="icon" variant="outline" title="주민번호 삭제" aria-label="주민번호 삭제" onClick={() => { setResident(""); setChanged(true); setVisible(false); setRevealed(""); }}><X /></Button>
      </div>{changed && !resident && <p className="text-xs text-red-700">저장 시 주민번호가 삭제됩니다.</p>}</div>
      <Field label="인사 처리"><select className={selectClass} value={action} onChange={event => setAction(event.target.value)}>{(person ? person.status === "employed" ? ["update", "resign", "dismiss"] as const : ["update", "rehire"] as const : ["hire"] as const).map(key => <option key={key} value={key}>{actionLabels[key]}</option>)}</select></Field>
      <Field label={action === "rehire" ? "재입사일" : "입사일"}><Input name="start" type="date" required max={today} readOnly={action === "resign" || action === "dismiss" || (person?.status !== "employed" && action === "update")} defaultValue={person?.employment_start_date ?? today} /></Field>
      <Field label="계약 종료일"><Input name="contract" type="date" defaultValue={person?.contract_end_date ?? ""} /></Field>
      <Field label="연봉 (원)"><Input name="salary" type="number" min={0} max={999999999999} step={1} defaultValue={person?.annual_salary ?? ""} /></Field>
      <Field label="급여 지급 은행"><Input name="bank_name" maxLength={100} defaultValue={person?.bank_name ?? ""} autoComplete="off" /></Field>
      <Field label="급여 계좌번호"><Input name="bank_account" type="text" inputMode="text" maxLength={50} pattern="[0-9 \\-]*" defaultValue={person?.bank_account ?? ""} autoComplete="off" /></Field>
      {action !== "hire" && action !== "rehire" && <Field label={action === "resign" || action === "dismiss" ? "퇴직일" : "처리 기준일"}><Input name="effective" type="date" required max={today} defaultValue={today} /></Field>}
      <Field label="처리 사유"><Input name="reason" required maxLength={2000} /></Field>
      <div className="sm:col-span-2"><Field label="메모"><Textarea name="memo" rows={4} maxLength={10000} defaultValue={person?.memo} /></Field></div>
    </fieldset>
    {(action === "resign" || action === "dismiss") && <p className="text-sm text-red-700">퇴직 처리 후 업무·근태 접근이 중지됩니다. 기존 직원정보와 이력은 보존됩니다.</p>}
    <ErrorMessage message={error} />
    <Button type="submit" disabled={busy || revealing}><Save className="size-4" />{busy ? "저장 중…" : `${actionLabels[action as keyof typeof actionLabels]} 저장`}</Button>
  </form>;
}

function EmployeeDetail({ id, accounts, today, saved, busyChanged }: { id: string; accounts: PersonnelList["accounts"]; today: string; saved: () => void; busyChanged: (value: boolean) => void }) {
  const [detail, setDetail] = useState<PersonnelDetail>();
  const [year, setYear] = useState(Number(today.slice(0, 4)));
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    request<PersonnelDetail>(`${api}?id=${id}&year=${year}`, { signal: controller.signal }).then(data => { if (!controller.signal.aborted) { setDetail(data); setError(""); } }).catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [id, year, revision]);
  return <div className="space-y-7"><ErrorMessage message={error} />{error && <Button variant="outline" onClick={() => setRevision(value => value + 1)}><RefreshCw className="size-4" />다시 불러오기</Button>}
    {!detail && !error && <p role="status">직원정보를 불러오는 중…</p>}
    {detail && <>
      <EmployeeForm key={`${id}:${detail.employee.version}`} detail={detail} accounts={accounts} today={today} saved={saved} busyChanged={busyChanged} />
      <section className="space-y-4 border-t pt-5"><div className="flex items-center justify-between gap-3"><h3 className="font-semibold">휴가 부여·사용 현황</h3><select aria-label="휴가 조회 연도" className={`${selectClass} max-w-28`} value={year} onChange={event => setYear(Number(event.target.value))}>{Array.from({ length: 12 }, (_, index) => Number(today.slice(0, 4)) + 1 - index).map(value => <option key={value} value={value}>{value}년</option>)}</select></div>
        {detail.leave.year !== year ? <p role="status">휴가 현황을 불러오는 중…</p> : <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">{[["기본 부여", detail.leave.baseGranted], ["추가 부여", detail.leave.extraGranted], ["승인 사용", detail.leave.used], ["신청 대기", detail.leave.pending], ["잔여", detail.leave.remaining], ["미래 승인 일정", detail.leave.upcoming]].map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 text-lg font-semibold">{value}일</dd></div>)}</dl>}
      </section>
      <section className="space-y-3 border-t pt-5"><h3 className="font-semibold">재직 기간</h3><ul className="divide-y text-sm">{detail.periods.map(period => <li className="py-3" key={period.id}>{period.start_date} ~ {period.end_date ?? "재직 중"}{period.end_reason && <span className="ml-3 text-muted-foreground">{actionLabels[period.end_reason as keyof typeof actionLabels]}</span>}</li>)}</ul></section>
      <section className="space-y-3 border-t pt-5"><h3 className="font-semibold">변경 이력 · 최근 100건</h3>{!detail.events.length && <p className="text-sm text-muted-foreground">변경 이력이 없습니다.</p>}<ul className="divide-y">{detail.events.map(event => <li className="space-y-1 py-3 text-sm" key={event.id}><p className="font-medium">{event.effective_date} · {actionLabels[event.action]} · {event.actor_name}</p><p className="whitespace-pre-wrap break-words text-muted-foreground">{event.reason}</p></li>)}</ul></section>
    </>}
  </div>;
}

export function PersonnelManager({ today }: { today: string }) {
  const [page, setPage] = useState(0), [status, setStatus] = useState("employed"), [search, setSearch] = useState(""), [q, setQ] = useState("");
  const [result, setResult] = useState<PersonnelList>();
  const [loadedKey, setLoadedKey] = useState("");
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const query = new URLSearchParams({ page: String(page), status, q }).toString();
  const key = `${query}:${revision}`;
  useEffect(() => {
    const controller = new AbortController();
    request<PersonnelList>(`${api}?${query}`, { signal: controller.signal }).then(data => { if (!controller.signal.aborted) { setResult(data); setLoadedKey(key); setError(""); } }).catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [query, key]);
  function saved() { setSelected(null); setRevision(value => value + 1); setMessage("임직원 정보를 저장했습니다."); }
  return <div className="mx-auto max-w-6xl space-y-5 px-4 py-7 sm:px-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-semibold">임직원 관리</h1><Button disabled={loadedKey !== key} onClick={() => { setSelected("new"); setMessage(""); }}><Plus className="size-4" />신규채용</Button></div>
    <form className="flex flex-wrap gap-2" onSubmit={event => { event.preventDefault(); setQ(search); setPage(0); }}><select aria-label="재직 상태" className={`${selectClass} sm:max-w-32`} value={status} onChange={event => { setStatus(event.target.value); setPage(0); }}><option value="all">전체</option>{Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><Input className="min-w-0 flex-1 sm:max-w-sm" aria-label="이름 또는 이메일 검색" placeholder="이름 또는 이메일" maxLength={150} value={search} onChange={event => setSearch(event.target.value)} /><Button size="icon" variant="outline" aria-label="검색" title="검색"><Search /></Button><Button type="button" size="icon" variant="outline" title="새로고침" aria-label="새로고침" onClick={() => setRevision(value => value + 1)}><RefreshCw /></Button></form>
    <ErrorMessage message={error} />{message && <p role="status" className="text-sm text-emerald-700">{message}</p>}
    {loadedKey !== key ? !error && <p role="status">직원 목록을 불러오는 중…</p> : <>
      <div className="overflow-x-auto border-y bg-background"><table className="w-full min-w-[620px] text-left text-sm"><thead><tr className="border-b"><th className="p-3">이름</th><th className="p-3">계정</th><th className="p-3">상태</th><th className="p-3">입사일</th></tr></thead><tbody>{result?.items.map(person => <tr className="border-b last:border-0" key={person.id}><td className="p-3"><button className="font-medium text-blue-700 underline underline-offset-4" onClick={() => { setSelected(person.id); setMessage(""); }}>{person.name}</button></td><td className="max-w-72 break-all p-3">{person.email}{!person.user_id && <span className="ml-2 text-xs text-muted-foreground">미연결</span>}</td><td className="p-3">{statusLabels[person.status]}</td><td className="p-3">{person.employment_start_date}</td></tr>)}</tbody></table></div>
      {!result?.items.length && <p className="py-6 text-center text-sm text-muted-foreground">해당하는 임직원이 없습니다.</p>}
      <div className="flex items-center justify-end gap-3 text-sm"><span>총 {result?.total ?? 0}명 · {page + 1}페이지</span><Button variant="outline" disabled={page === 0} onClick={() => setPage(value => value - 1)}>이전</Button><Button variant="outline" disabled={(page + 1) * 50 >= (result?.total ?? 0)} onClick={() => setPage(value => value + 1)}>다음</Button></div>
    </>}
    <Dialog open={selected !== null} onOpenChange={open => { if (!open && !busy) setSelected(null); }}><DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-clip p-0 sm:max-w-3xl"><DialogHeader className="shrink-0 border-b p-5 pr-12"><DialogTitle>{selected === "new" ? "신규채용" : "임직원 상세"}</DialogTitle><DialogDescription>신상정보 · 계약정보 · 재직 이력</DialogDescription></DialogHeader><div className="min-h-0 overflow-y-auto p-5">{selected === "new" ? <EmployeeForm key="new" accounts={result?.accounts ?? []} today={today} saved={saved} busyChanged={setBusy} /> : selected && <EmployeeDetail key={selected} id={selected} accounts={result?.accounts ?? []} today={today} saved={saved} busyChanged={setBusy} />}</div></DialogContent></Dialog>
  </div>;
}
