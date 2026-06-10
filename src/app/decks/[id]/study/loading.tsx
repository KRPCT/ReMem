// This skeleton ONLY renders on initial navigation to /study.
// It NEVER shows during in-session answerCardAction calls: those are Server
// Actions invoked inside the already-mounted StudySession client component
// and do not trigger loading.tsx. In-session pending state is handled by
// isPending inside StudySession.

export default function StudyLoading() {
  return (
    <main className="mx-auto max-w-reading space-y-6 px-4 py-8 md:px-6 md:py-10">
      {/* toolbar ghost */}
      <div className="flex items-center justify-between">
        <div className="h-4 w-20 animate-pulse rounded bg-muted" />
        <div className="h-4 w-24 animate-pulse rounded bg-muted" />
      </div>
      {/* session -- progress bar + card face + rating bar */}
      <div className="space-y-4">
        <div className="h-1.5 w-full animate-pulse rounded-full bg-muted" />
        <div className="glass-card h-64 animate-pulse rounded-xl bg-muted/40" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-muted/40" />
          ))}
        </div>
      </div>
    </main>
  );
}
