import Link from "next/link";

type AdPerformanceTab = "daily" | "creative";

const tabs = [
  { id: "daily", label: "일일성과", href: "/services/ad-performance/daily" },
  { id: "creative", label: "소재성과", href: "/services/ad-performance/creative" },
] as const;

export function AdPerformanceTabs({ active }: { active: AdPerformanceTab }) {
  return (
    <nav aria-label="광고성과 메뉴" className="mt-7 border-b">
      <div className="flex gap-1 overflow-x-auto">
        {tabs.map((tab) => (
          <Link
            key={tab.id}
            href={tab.href}
            aria-current={active === tab.id ? "page" : undefined}
            className={`-mb-px inline-flex min-h-11 shrink-0 items-center border-b-2 px-5 text-sm font-medium transition-colors focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
              active === tab.id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
