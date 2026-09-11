"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Calculator } from "lucide-react";
import {
  calculate, configureInputs, DEFAULTS, formatMargin, formatWon, MAX_MONEY,
  MONEY_KEYS, parseMoneyInput, type MoneyKey, type SettlementInputs,
} from "@/lib/tools/settlement-calculator";

type ModelTool = {
  name: string; description: string; inputSchema: Record<string, unknown>;
  execute: (args: unknown) => Promise<{ content: Array<{ type: "text"; text: string }> }>;
};
type ModelContext = { registerTool: (tool: ModelTool) => void; unregisterTool: (name: string) => void };

const labels: Record<MoneyKey, string> = {
  price: "강의 평균 가격", ad: "광고비", rs: "RS 비용", materials: "교안 / 상세페이지", youtube: "유튜브 출연료", venue: "행사장 대여비",
};

export function SettlementCalculator() {
  const [inputs, setInputs] = useState<SettlementInputs>({ ...DEFAULTS });
  const [revision, setRevision] = useState(0);
  const current = useRef(inputs);
  const results = calculate(inputs);
  const [announcement, setAnnouncement] = useState("");
  const quantityId = useId();

  function updateInput(key: keyof SettlementInputs, value: number) {
    const next = configureInputs(current.current, { [key]: value });
    current.current = next;
    setInputs(next);
  }

  useEffect(() => {
    const timer = setTimeout(() => setAnnouncement(`최종 회사분 ${formatWon(results.companyFinal)}, 회사 순이익률 ${formatMargin(results.companyMargin)}, 부가세 포함 최종 강사분 ${formatWon(results.instructorFinal)}`), 350);
    return () => clearTimeout(timer);
  }, [results.companyFinal, results.companyMargin, results.instructorFinal]);

  useEffect(() => {
    const context = (document as Document & { modelContext?: ModelContext }).modelContext;
    if (!context?.registerTool || !context.unregisterTool) return;
    const registered: string[] = [];
    const snapshot = () => ({ content: [{ type: "text" as const, text: JSON.stringify({ inputs: current.current, results: calculate(current.current), currency: "KRW" }) }] });
    try {
      context.registerTool({
        name: "configure_settlement", description: "강의 정산 계산기의 입력값을 변경합니다.",
        inputSchema: { type: "object", additionalProperties: false, minProperties: 1, properties: {
          ...Object.fromEntries(MONEY_KEYS.map((key) => [key, { type: "integer", minimum: 0, maximum: MAX_MONEY }])),
          quantity: { type: "integer", minimum: 0, maximum: 100 },
        } },
        execute: async (patch) => {
          const next = configureInputs(current.current, patch);
          current.current = next;
          setInputs(next);
          setRevision((value) => value + 1);
          return snapshot();
        },
      });
      registered.push("configure_settlement");
      context.registerTool({ name: "read_settlement", description: "현재 입력값과 반올림 전 계산 결과를 조회합니다.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, execute: async () => snapshot() });
      registered.push("read_settlement");
    } catch {
      // Optional browser integration must never prevent normal calculator use.
    }
    return () => { for (const name of registered) { try { context.unregisterTool(name); } catch { /* Optional integration. */ } } };
  }, []);

  function moneyField(key: MoneyKey) {
    return <MoneyInput key={`${key}-${revision}`} label={labels[key]} value={inputs[key]} onChange={(value) => updateInput(key, value)} />;
  }

  return (
    <div className="mx-auto max-w-[1320px] px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-6">
        <p className="text-sm font-semibold text-[#244fdd]">bizupclass 비즈업클래스</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight sm:text-3xl"><Calculator aria-hidden="true" />강의 정산 계산기</h1>
          <span className="rounded-full border border-[#d7e0f7] bg-white px-3 py-1 text-xs font-semibold text-[#244fdd]">강사 50% / 회사 50%</span>
        </div>
        <p className="mt-2 text-[#66738a]">가격과 판매 수량을 바꾸며 예상 정산금을 확인하세요.</p>
      </header>

      <div className="grid items-start gap-5 min-[900px]:grid-cols-[minmax(0,0.85fr)_minmax(0,1.4fr)]">
        <Panel title="매출 설정" className="min-[900px]:col-start-1 min-[900px]:row-start-1">
          {moneyField("price")}
          <div className="mt-5">
            <div className="mb-3 flex items-center justify-between"><label htmlFor={quantityId} className="text-sm font-medium">판매 수량</label><output htmlFor={quantityId} className="text-3xl font-bold tabular-nums text-[#244fdd]">{inputs.quantity}개</output></div>
            <input id={quantityId} type="range" min={0} max={100} step={1} value={inputs.quantity} aria-valuetext={`${inputs.quantity}개`} onChange={(event) => updateInput("quantity", Number(event.target.value))} className="h-7 w-full cursor-pointer accent-[#244fdd] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#244fdd]" />
            <div aria-hidden="true" className="mt-1 flex justify-between text-xs text-[#66738a]"><span>0개</span><span>25</span><span>50</span><span>75</span><span>100개</span></div>
          </div>
          <div className="mt-5 rounded-xl bg-[#f4f6fa] p-4"><p className="text-sm text-[#66738a]">전체 매출</p><p className="mt-1 break-all text-2xl font-bold tabular-nums">{formatWon(results.gross)}</p></div>
        </Panel>

        <section aria-label="정산 결과" className="min-w-0 space-y-5 min-[900px]:col-start-2 min-[900px]:row-span-3 min-[900px]:row-start-1">
          <div className="grid gap-4 min-[540px]:grid-cols-2">
            <div className="min-w-0 rounded-[18px] bg-[#244fdd] p-5 text-white">
              <h2 className="font-semibold">최종 회사분 {results.companyFinal < 0 && <span className="ml-1 rounded bg-white/20 px-2 py-0.5 text-xs">손실</span>}</h2>
              <p data-testid="company-final" className="mt-3 break-all text-2xl font-bold tabular-nums sm:text-3xl">{formatWon(results.companyFinal)}</p>
              <p className="mt-2 text-sm">매출 대비 회사 순이익률 <strong data-testid="company-margin" className="tabular-nums">{formatMargin(results.companyMargin)}</strong></p>
              {results.companyMargin === null && <p className="mt-1 text-xs text-white/85">전체 매출이 0원이므로 비율을 계산할 수 없습니다.</p>}
              <p className="mt-5 text-xs text-white/85">회사 정산대상금액 − 회사부담 고정비</p>
              <p className="mt-1 break-words text-xs text-white/85">회사부담 고정비 {formatWon(results.companyCosts)}</p>
            </div>
            <div className="min-w-0 rounded-[18px] bg-[#eaf3f2] p-5 text-[#185b56]">
              <h2 className="font-semibold">최종 강사분 <span className="ml-1 rounded bg-white/75 px-2 py-0.5 text-xs">부가세 포함</span></h2>
              <p data-testid="instructor-final" className="mt-3 break-all text-2xl font-bold tabular-nums sm:text-3xl">{formatWon(results.instructorFinal)}</p>
              <p className="mt-2 break-words text-sm">부가세 포함 전 {formatWon(results.half)}</p>
              <p className="mt-5 text-xs">강사 정산대상금액 + 부가세 10%</p>
            </div>
          </div>
          <p role="status" aria-live="polite" className="sr-only">{announcement}</p>
          {results.remaining < 0 ? <Notice>공동비용 차감 후 적자입니다. 요청한 계산식에 따라 음수 금액도 50:50으로 배분하며, 강사분의 부가세 10%도 음수로 반영됩니다.</Notice> : results.companyFinal < 0 ? <Notice>회사부담 고정비를 차감하면 회사분에 손실이 발생합니다.</Notice> : null}
          <Panel title="정산 계산 내역">
            <dl className="space-y-3 text-sm">
              <Line label="전체 매출" value={results.gross} detail={`${formatWon(inputs.price)} × ${inputs.quantity}개`} strong />
              <Line label="PG사 수수료 7.5%" value={-results.pg} />
              <Line label="PG 수수료 차감 후 금액" value={results.afterPg} />
              <Line label="노바 수수료 3.3%" value={-results.fee} detail="PG 수수료 차감 후 금액 기준" />
              <Line label="정산대상 매출" value={results.settlement} strong />
              <Line label="공동부담 광고비" value={-results.ad} />
              <Line label="공동부담 RS 비용" value={-results.rs} />
              <Line label="공동비용 차감 후 남은 금액" value={results.remaining} strong />
            </dl>
            <p className="my-5 rounded-lg bg-[#f4f6fa] p-3 text-center text-sm font-medium text-[#244fdd]">남은 금액을 절반씩 배분</p>
            <div className="grid gap-5 min-[540px]:grid-cols-2">
              <div className="min-w-0"><h3 className="mb-3 text-sm font-semibold text-[#244fdd]">회사 50%</h3><dl className="space-y-3 text-sm"><Line label="회사 정산대상금액" value={results.half} /><Line label="회사부담 고정비" value={-results.companyCosts} /><Line label="최종 회사분" value={results.companyFinal} strong /></dl></div>
              <div className="min-w-0"><h3 className="mb-3 text-sm font-semibold text-[#185b56]">강사 50%</h3><dl className="space-y-3 text-sm"><Line label="강사 정산대상금액" value={results.half} /><Line label="부가세 10%" value={results.vat} plus /><Line label="최종 강사분" value={results.instructorFinal} strong /></dl></div>
            </div>
          </Panel>
        </section>

        <Panel title="강사·회사 공동부담" description="배분 전 정산대상 매출에서 전액 차감" className="min-[900px]:col-start-1 min-[900px]:row-start-2">
          <div className="space-y-4">{moneyField("ad")}{moneyField("rs")}</div>
          <dl className="mt-5 border-t border-[#e4e9f1] pt-4"><Line label="공동부담 합계" value={results.shared} strong /></dl>
        </Panel>
        <Panel title="회사부담 고정비" description="배분 후 회사 정산대상금액에서 차감" className="min-[900px]:col-start-1 min-[900px]:row-start-3">
          <div className="mb-4 rounded-xl bg-[#f4f6fa] p-3"><p className="text-sm font-medium">광고 집행비</p><p className="mt-1 text-xs text-[#66738a]">광고비의 16.5% · 자동 계산</p><p data-testid="execution" className="mt-2 break-all font-semibold tabular-nums">{formatWon(results.execution)}</p></div>
          <div className="space-y-4">{moneyField("materials")}{moneyField("youtube")}{moneyField("venue")}</div>
          <dl className="mt-5 border-t border-[#e4e9f1] pt-4"><Line label="회사부담 합계" value={results.companyCosts} strong /></dl>
        </Panel>
      </div>

      <aside aria-label="계산 기준" className="mt-6 space-y-2 text-xs leading-relaxed text-[#66738a]">
        <p>전체 매출에서 PG사 수수료 7.5%를 먼저 차감한 뒤, 남은 금액의 3.3%를 노바 수수료로 차감합니다.</p>
        <p>회사 순이익률 = 최종 회사분 ÷ 전체 매출 × 100. 소수점 둘째 자리까지 표시합니다.</p>
        <p>강사 부가세는 강사 정산대상금액의 10%이며, 회사분에서 추가 차감하지 않습니다.</p>
        <p>중간 계산은 반올림하지 않고, 표시 금액만 원 단위로 반올림합니다.</p>
      </aside>
      <footer className="mt-6 border-t border-[#e4e9f1] pt-5 text-sm text-[#66738a]">입력값은 저장되지 않습니다. 새로고침하면 기본값으로 돌아갑니다.</footer>
    </div>
  );
}

function MoneyInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  const id = useId();
  const [text, setText] = useState(value.toLocaleString("ko-KR"));
  const [error, setError] = useState("");
  return <div>
    <label htmlFor={id} className="mb-2 block text-sm font-medium">{label}</label>
    <div className="relative">
      <input id={id} type="text" inputMode="numeric" autoComplete="off" spellCheck={false} value={text} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined}
        className="w-full min-w-0 rounded-xl border border-[#d7dfea] bg-white py-3 pr-9 pl-3 text-right text-base tabular-nums outline-none focus:border-[#244fdd] focus:ring-2 focus:ring-[#244fdd]/20 aria-invalid:border-red-600"
        onChange={(event) => {
          const element = event.currentTarget;
          const raw = element.value;
          const parsed = parseMoneyInput(raw);
          if (parsed.error !== undefined) { setText(raw); setError(parsed.error); return; }
          const digitsBeforeCaret = raw.slice(0, element.selectionStart ?? raw.length).replace(/\D/g, "").length;
          const formatted = raw.trim() === "" ? "" : parsed.value.toLocaleString("ko-KR");
          setText(formatted); setError(""); onChange(parsed.value);
          let caret = 0, digits = 0;
          while (caret < formatted.length && digits < digitsBeforeCaret) { if (/\d/.test(formatted[caret])) digits++; caret++; }
          requestAnimationFrame(() => { if (document.activeElement === element) element.setSelectionRange(caret, caret); });
        }}
        onBlur={() => { if (!text.trim()) setText("0"); }} />
      <span className="pointer-events-none absolute top-3 right-3 text-[#66738a]">원</span>
    </div>
    {error && <p id={`${id}-error`} role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
  </div>;
}

function Panel({ title, description, className = "", children }: { title: string; description?: string; className?: string; children: ReactNode }) {
  return <section className={`min-w-0 rounded-[18px] border border-[#e4e9f1] bg-white p-5 ${className}`}><h2 className="text-lg font-semibold">{title}</h2>{description && <p className="mt-1 text-xs text-[#66738a]">{description}</p>}<div className="mt-4">{children}</div></section>;
}

function Line({ label, value, detail, strong = false, plus = false }: { label: string; value: number; detail?: string; strong?: boolean; plus?: boolean }) {
  return <div className={`flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 ${strong ? "font-semibold" : ""}`}><dt className="min-w-0">{label}{detail && <span className="mt-1 block text-xs font-normal text-[#66738a]">{detail}</span>}</dt><dd className="ml-auto max-w-full break-all text-right tabular-nums">{formatWon(value, plus)}</dd></div>;
}

function Notice({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900">{children}</p>;
}
