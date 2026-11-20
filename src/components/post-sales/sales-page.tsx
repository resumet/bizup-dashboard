import { ArrowUpRight, Lightbulb, Play } from "lucide-react";
import { webLink, youtubeId, type SalesPage } from "@/lib/post-sales/model";

export const invitationHeading = "단, 이것만은 기억해 주세요!";
export const giftHeading = "혼자서도 첫걸음을 시작할 수 있도록 선물을 준비했습니다!";

function Action({ href, children, primary = false }: { href: string; children: React.ReactNode; primary?: boolean }) {
  const url = webLink(href);
  if (!url) return null;
  return <a href={url} target="_blank" rel="noopener noreferrer" className={primary
    ? "inline-flex items-center gap-2 rounded-lg bg-teal-800 px-5 py-3 font-semibold text-white hover:bg-teal-900"
    : "inline-flex items-center gap-2 font-semibold text-teal-800 underline underline-offset-4"}>
    {children}<ArrowUpRight aria-hidden className="size-4" /></a>;
}

export function SalesPageView({ page }: { page: SalesPage }) {
  const video = youtubeId(page.videoUrl);
  const questions = (page.concernQuestions ?? []).map(question => question.trim()).filter(Boolean);
  const paragraph = "whitespace-pre-line break-words text-[1rem] leading-8 text-slate-700";
  const heading = "text-xl font-bold tracking-tight text-slate-900";
  return <article className="mx-auto max-w-3xl overflow-hidden rounded-2xl border border-stone-200 bg-white text-slate-900 shadow-sm">
    <header className="border-b border-teal-100 bg-teal-50 px-6 py-9 sm:px-10">
      <h1 className="break-words text-3xl leading-tight font-bold tracking-tight sm:text-4xl">{page.title || page.courseName}</h1>
      {page.instructor && <p className="mt-4 font-medium text-teal-900">{page.instructor} 강사</p>}
      {page.chatUrl && <div className="mt-4"><Action href={page.chatUrl}>무료 단톡방 참가하기</Action></div>}
    </header>
    <div className="space-y-9 px-6 py-8 sm:px-10">
      {page.intro && <section aria-label="인사"><p className={paragraph}>{page.intro}</p></section>}
      {video && <section aria-label="강사 유튜브 출연영상" className="space-y-3">
        <iframe title="강사 출연영상" className="aspect-video w-full rounded-xl border-0" loading="lazy" referrerPolicy="strict-origin-when-cross-origin"
          allow="encrypted-media; picture-in-picture; fullscreen" allowFullScreen src={`https://www.youtube-nocookie.com/embed/${video}`} />
        <Action href={page.videoUrl}>유튜브에서 보기</Action></section>}
      {page.recap && <section className="space-y-3"><h2 className={heading}>무료강의 내용 안내</h2><p className={paragraph}>{page.recap}</p></section>}
      {(questions.length > 0 || page.concernExplanation?.trim()) && <section className="space-y-4">
        <h2 className={heading}>가능한 건 알겠는데, 막상 시작하려니 막막하죠?</h2>
        {questions.length > 0 && <div className="space-y-3 rounded-xl bg-stone-100 px-5 py-4">
          <h3 className="flex items-start gap-2 text-base font-medium"><Lightbulb aria-hidden className="mt-0.5 size-5 shrink-0 text-amber-600" />이런 고민이 남아 있을 수 있습니다.</h3>
          <ol className="ml-7 list-decimal space-y-2 pl-5 leading-relaxed">{questions.map((question, i) =>
            <li key={i} className="break-words pl-1"><strong>{question}</strong></li>)}</ol>
        </div>}
        {page.concernExplanation?.trim() && <p className={paragraph}>{page.concernExplanation}</p>}
      </section>}
      {(page.gifts || page.giftUrl) && <section className="space-y-4 rounded-xl border border-teal-100 bg-teal-50/60 p-5">
        <h2 className={heading}>{giftHeading}</h2>
        {page.gifts && <p className={paragraph}>{page.gifts}</p>}<Action href={page.giftUrl}><span aria-hidden>🎁</span>무료특강 선물 받기</Action></section>}
      {page.invitation.trim() && <section className="space-y-3">
        <h2 className={heading}>{invitationHeading}</h2>
        <p className={paragraph}>{page.invitation}</p>
      </section>}
      <section className="space-y-3 border-t pt-6"><h2 className={heading}>무료강의 다시보기</h2>
        <Action href={page.replayUrl}><Play className="size-4" />다시보기 영상 열기</Action></section>
      <section className="space-y-4 border-t pt-6"><h2 className={heading}>정규강의 일정 및 커리큘럼 안내</h2>
        <p className={paragraph}>{page.courseName}</p><Action primary href={page.paymentUrl}>커리큘럼 확인하고 수강 신청하기</Action></section>
      <section className="space-y-4 border-t pt-6"><h2 className={heading}>신용카드 무이자 할부 안내</h2>
        <table className="w-full border-collapse text-sm tabular-nums"><thead className="bg-stone-100 text-left"><tr>
          {["카드사", "최대 무이자 할부", "최대 할부"].map(label => <th key={label} scope="col" className="px-3 py-3">{label}</th>)}</tr></thead>
          <tbody>{page.cards.map(row => <tr key={row.issuer} className="border-b border-stone-100"><th scope="row" className="px-3 py-2 text-left font-medium">{row.issuer}</th>
            <td className="px-3">{row.interestFree ? `${row.interestFree}개월` : "미제공"}</td><td className="px-3">{row.installment ? `${row.installment}개월` : "미제공"}</td></tr>)}</tbody></table></section>
    </div>
  </article>;
}
