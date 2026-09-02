export function ServiceRouteSkeleton() {
  return (
    <main className="min-h-screen" aria-busy="true" aria-label="화면 불러오는 중">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-18 max-w-[1600px] items-center gap-3 px-5 lg:px-8">
          <div className="h-9 w-28 animate-pulse rounded-lg bg-muted" />
          <div className="h-5 w-px bg-border" />
          <div className="h-5 w-48 animate-pulse rounded bg-muted" />
        </div>
      </header>
      <div className="mx-auto max-w-[1600px] space-y-6 px-5 py-8 lg:px-8">
        <div className="space-y-3">
          <div className="h-7 w-64 animate-pulse rounded bg-muted" />
          <div className="h-4 w-96 max-w-full animate-pulse rounded bg-muted" />
        </div>
        <div className="grid gap-6 xl:grid-cols-2">
          <div className="h-80 animate-pulse rounded-xl border bg-muted/60" />
          <div className="h-80 animate-pulse rounded-xl border bg-muted/60" />
        </div>
      </div>
      <span className="sr-only">화면을 불러오고 있습니다.</span>
    </main>
  );
}
