export default function FavoritesLoading() {
  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-12 md:px-6 md:py-14">
      <div className="space-y-2">
        <div className="h-4 w-28 animate-pulse rounded bg-muted" />
        <div className="h-9 w-40 animate-pulse rounded bg-muted" />
      </div>
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl bg-muted/40" />
        ))}
      </div>
    </main>
  );
}
