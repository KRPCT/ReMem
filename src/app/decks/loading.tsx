export default function DecksLoading() {
  return (
    <main className="mx-auto max-w-content px-4 py-8 md:px-8 md:py-12">
      {/* header ghost */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <div className="h-3 w-32 animate-pulse rounded bg-muted" />
          <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        </div>
        <div className="h-10 w-28 animate-pulse rounded bg-muted" />
      </div>
      {/* deck tile grid ghost */}
      <ul className="grid gap-5 sm:gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {[1, 2, 3, 4].map((i) => (
          <li key={i}>
            <div className="glass-card h-36 animate-pulse rounded-xl bg-muted/40" />
          </li>
        ))}
      </ul>
    </main>
  );
}
