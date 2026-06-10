export default function StatsLoading() {
  return (
    <main className="mx-auto max-w-content px-4 pb-20 pt-12 md:px-8 md:pt-20">
      <div className="mb-6 space-y-1">
        <div className="h-3 w-32 animate-pulse rounded bg-muted" />
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
      </div>
      <div className="grid gap-xxl">
        {/* heatmap ghost */}
        <div className="h-48 animate-pulse rounded-xl bg-muted/40" />
        {/* retention curve ghost */}
        <div className="h-64 animate-pulse rounded-xl bg-muted/40" />
      </div>
    </main>
  );
}
