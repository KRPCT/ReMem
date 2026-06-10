export default function CardEditLoading() {
  return (
    <main className="mx-auto max-w-reading space-y-4 px-4 py-12 md:px-6 md:py-14">
      <div className="h-4 w-20 animate-pulse rounded bg-muted" />
      <div className="h-9 w-40 animate-pulse rounded bg-muted" />
      <div className="rounded-xl border border-border bg-card p-6 space-y-6">
        <div className="h-10 animate-pulse rounded-lg bg-muted/40" />
        <div className="h-32 animate-pulse rounded-lg bg-muted/40" />
        <div className="h-32 animate-pulse rounded-lg bg-muted/40" />
        <div className="h-10 w-24 animate-pulse rounded-lg bg-muted/40" />
      </div>
    </main>
  );
}
