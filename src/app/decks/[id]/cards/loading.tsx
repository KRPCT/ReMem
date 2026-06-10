export default function CardListLoading() {
  return (
    <main className="mx-auto max-w-content space-y-4 px-4 py-12 md:px-6 md:py-14">
      <div className="h-4 w-20 animate-pulse rounded bg-muted" />
      <div className="rounded-xl border border-border bg-card">
        <div className="space-y-2 p-6">
          <div className="h-5 w-24 animate-pulse rounded bg-muted" />
          <div className="h-4 w-16 animate-pulse rounded bg-muted" />
        </div>
        <div className="space-y-2 px-6 pb-6">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-muted/40" />
          ))}
        </div>
      </div>
    </main>
  );
}
