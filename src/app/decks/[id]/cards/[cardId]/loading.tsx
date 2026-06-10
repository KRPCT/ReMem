export default function CardDetailLoading() {
  return (
    <main className="mx-auto max-w-reading space-y-4 px-4 py-12 md:px-6 md:py-14">
      {/* action bar ghost */}
      <div className="h-11 animate-pulse rounded-xl bg-muted/40" />
      {/* front content ghost */}
      <div className="h-32 animate-pulse rounded-xl bg-muted/40" />
      <div className="my-2 h-px bg-border" />
      {/* back content ghost */}
      <div className="h-32 animate-pulse rounded-xl bg-muted/40" />
      {/* progress ghost */}
      <div className="h-24 animate-pulse rounded-xl bg-muted/40" />
    </main>
  );
}
