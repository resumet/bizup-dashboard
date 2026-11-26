import { webLink } from "@/lib/post-sales/model";
import type { ReplayGuide } from "@/lib/replay-guide/model";

export function GuideView({ draft }: { draft: ReplayGuide }) {
  return <article className="mx-auto max-w-3xl space-y-8 rounded-xl border bg-card p-5 text-card-foreground sm:p-9">
    <h1 className="break-words text-3xl font-bold">{draft.title}</h1>
    {draft.sections.map((section, index) => <section key={section.id} className="space-y-3">
      <h2 className="break-words rounded-md bg-amber-100 px-3 py-2 text-xl font-semibold text-stone-900">{index + 1}. {section.heading}</h2>
      {section.body && <p className="whitespace-pre-wrap break-words leading-7">{section.body}</p>}
      {webLink(section.link) && <a className="block break-all text-primary underline" href={section.link} target="_blank" rel="noopener noreferrer">{section.link}</a>}
      {section.images.map((image, i) =>
        // Uploaded screenshots retain their aspect ratio at mobile and desktop widths.
        // eslint-disable-next-line @next/next/no-img-element
        <img key={image} src={image} alt={`${section.heading} 화면 ${i + 1}`} loading="lazy" className="h-auto max-w-full rounded-md border" />)}
      {section.note && <aside className="whitespace-pre-wrap break-words rounded-md bg-muted p-4">{section.note}</aside>}
    </section>)}
  </article>;
}
