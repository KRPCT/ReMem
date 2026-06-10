export default function DeckDetailLoading() {
  return (
    <main className="mx-auto max-w-content space-y-4 px-4 py-12 md:px-6 md:py-14">
      <div className="space-y-2">
        <div className="h-4 w-20 animate-pulse rounded bg-muted" />
        <div className="h-9 w-56 animate-pulse rounded bg-muted" />
      </div>
      {/* hero CTA card ghost */}
      <div className="glass-card h-28 animate-pulse rounded-xl border border-brand/20 bg-muted/40" />
      {/* info + progress cards ghost */}
      <div className="glass-card h-20 animate-pulse rounded-xl bg-muted/40" />
      <div className="glass-card h-20 animate-pulse rounded-xl bg-muted/40" />
      {/* stats grid ghost */}
      <div className="grid gap-l md:grid-cols-2">
        <div className="h-48 animate-pulse rounded-xl bg-muted/40" />
        <div className="h-48 animate-pulse rounded-xl bg-muted/40" />
      </div>
      {/* card list ghost */}
      <div className="h-64 animate-pulse rounded-xl bg-muted/40" />
    </main>
  );
}
