export default function SettingsLoading() {
  return (
    <main className="mx-auto max-w-reading space-y-6 px-4 py-12 md:px-6 md:py-14">
      <div className="h-4 w-20 animate-pulse rounded bg-muted" />
      <div className="h-9 w-40 animate-pulse rounded bg-muted" />
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="h-36 animate-pulse rounded-xl bg-muted/40" />
      ))}
    </main>
  );
}
