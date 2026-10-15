"use client";

import { useEffect, useState } from "react";
import { Loader2, Paperclip, Plus, Search, Settings2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMoney, summarizeLedger, visibleEntries, type Entry, type LedgerState } from "@/lib/cash-ledger/model";
import { EntryDialog, ErrorMessage, ledgerRequest, OpeningDialog, PartiesDialog } from "./ledger-dialogs";

export function LedgerWorkspace() {
  const [state, setState] = useState<LedgerState | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [opening, setOpening] = useState(false), [parties, setParties] = useState(false);
  const [editor, setEditor] = useState<{ entry: Entry | null; openAttachments?: boolean } | null>(null);
  const [page, setPage] = useState(0);
  async function reload() { const body = await ledgerRequest(); setState(body.state); setError(""); }
  useEffect(() => {
    let active = true;
    ledgerRequest().then(body => { if (active) setState(body.state); }).catch(failure => { if (active) setError(failure.message); });
    return () => { active = false; };
  }, []);
  if (!state) return <div className="py-16"><ErrorMessage message={error} />{error ? <Button className="mt-4" onClick={() => void reload().catch(failure => setError(failure.message))}>다시 불러오기</Button> : <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />장부를 불러오는 중…</p>}</div>;
  const summary = summarizeLedger(state.settings, state.entries);
  const rows = visibleEntries(state, query);
  const pageCount = Math.max(1, Math.ceil(rows.length / 50));
  const currentPage = Math.min(page, pageCount - 1);
  const partyNames = new Map(state.parties.map(p => [p.id, p.name]));
  const courseNames = new Map(state.courses.map(c => [c.id, c.name]));
  const counts = new Map<string, number>();
  for (const attachment of state.attachments) counts.set(attachment.entryId, (counts.get(attachment.entryId) ?? 0) + 1);
  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-4"><h1 className="text-2xl font-semibold tracking-tight">입출금 장부</h1><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setParties(true)}><Users />거래처 관리</Button><Button variant="outline" onClick={() => setOpening(true)}><Settings2 />시작 잔고 {state.settings ? "수정" : "등록"}</Button><Button disabled={!state.settings} onClick={() => setEditor({ entry: null })}><Plus />내역 등록</Button></div></div>
    <ErrorMessage message={error} />
    {!state.settings ? <div className="rounded-lg border border-dashed px-6 py-14 text-center"><p className="mb-4 text-sm text-muted-foreground">입출금 기록을 시작할 날짜와 은행 잔고를 등록해 주세요.</p><Button onClick={() => setOpening(true)}>시작 잔고 등록</Button></div> : <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[
        { label: `시작 잔고 · ${state.settings.startDate}`, value: BigInt(state.settings.openingBalance), color: "" },
        { label: "입금 합계", value: summary.income, color: "text-blue-700" },
        { label: "지출 합계", value: summary.expense, color: "text-rose-700" },
        { label: "전체 잔액", value: summary.balance, color: "text-foreground" },
      ].map(card => <div key={card.label} className="rounded-lg border bg-card p-5"><p className="text-sm text-muted-foreground">{card.label}</p><p className={`mt-3 text-2xl font-semibold tabular-nums ${card.color}`}>{formatMoney(card.value)}<span className="ml-1 text-sm font-normal">원</span></p></div>)}</div>
      <div className="flex flex-wrap items-center justify-between gap-3"><div className="relative w-full sm:max-w-xl"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input className="pl-9" aria-label="입출금 내역 검색" placeholder="제목, 지급대상, 관련강의, 금액, 비고 검색" value={query} onChange={e => { setQuery(e.target.value); setPage(0); }} /></div><p className="text-sm text-muted-foreground">{formatMoney(rows.length)}건</p></div>
      <div className="overflow-hidden rounded-lg border"><Table><TableHeader><TableRow><TableHead>번호</TableHead><TableHead>구분</TableHead><TableHead className="min-w-48">제목</TableHead><TableHead>지급대상</TableHead><TableHead>관련강의</TableHead><TableHead className="text-right">지급/입금금액</TableHead><TableHead>날짜</TableHead><TableHead className="min-w-32">비고</TableHead><TableHead className="text-right" title="시작 잔고에 해당 날짜까지의 모든 입금과 지출을 반영한 잔액">그 날짜까지 총액</TableHead><TableHead>파일첨부</TableHead></TableRow></TableHeader><TableBody>
        {rows.slice(currentPage * 50, (currentPage + 1) * 50).map(entry => <TableRow key={entry.id}><TableCell className="tabular-nums text-muted-foreground">{entry.number}</TableCell><TableCell><span className={`inline-flex rounded-md px-2 py-1 text-xs font-medium ${entry.kind === "income" ? "bg-blue-50 text-blue-700" : "bg-rose-50 text-rose-700"}`}>{entry.kind === "income" ? "입금" : "지출"}</span></TableCell><TableCell><button className="text-left font-medium text-primary hover:underline" onClick={() => setEditor({ entry })}>{entry.title}</button></TableCell><TableCell>{partyNames.get(entry.partyId) ?? "—"}</TableCell><TableCell className="max-w-56 truncate">{courseNames.get(entry.courseId ?? "") ?? "—"}</TableCell><TableCell className={`whitespace-nowrap text-right tabular-nums ${entry.kind === "income" ? "text-blue-700" : "text-rose-700"}`}>{entry.kind === "income" ? "+" : "−"}{formatMoney(entry.amount)}원</TableCell><TableCell className="whitespace-nowrap tabular-nums">{entry.entryDate}</TableCell><TableCell className="max-w-64 whitespace-pre-wrap break-words">{entry.note || "—"}</TableCell><TableCell className="whitespace-nowrap text-right font-medium tabular-nums">{formatMoney(summary.balances.get(entry.entryDate) ?? BigInt(0))}원</TableCell><TableCell><button aria-label={`${entry.title} 파일첨부`} className="flex items-center gap-1 rounded-md px-2 py-1 text-muted-foreground hover:bg-muted hover:text-primary" onClick={() => setEditor({ entry, openAttachments: true })}><Paperclip className="size-3.5" />{counts.get(entry.id) ?? 0}</button></TableCell></TableRow>)}
        {!rows.length ? <TableRow><TableCell colSpan={10} className="h-32 text-center text-muted-foreground">{query ? "검색 결과가 없습니다." : "등록된 입출금 내역이 없습니다."}</TableCell></TableRow> : null}
      </TableBody></Table></div>
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-muted-foreground">날짜별 총액은 검색과 관계없이 전체 기록으로 계산하며, 같은 날짜의 모든 입출금을 포함합니다.</p>{pageCount > 1 ? <div className="flex items-center gap-3"><Button variant="outline" size="sm" disabled={!currentPage} onClick={() => setPage(currentPage - 1)}>이전</Button><span className="text-sm">{currentPage + 1} / {pageCount}</span><Button variant="outline" size="sm" disabled={currentPage + 1 === pageCount} onClick={() => setPage(currentPage + 1)}>다음</Button></div> : null}</div>
    </>}
    {opening ? <OpeningDialog settings={state.settings} onClose={() => setOpening(false)} onSaved={reload} /> : null}
    {editor ? <EntryDialog entry={editor.entry} state={state} openAttachments={editor.openAttachments} onClose={() => setEditor(null)} onSaved={reload} onManageParties={() => setParties(true)} /> : null}
    {parties ? <PartiesDialog parties={state.parties} onClose={() => setParties(false)} onSaved={reload} /> : null}
  </div>;
}
