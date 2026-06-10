import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { ZhTitle } from "@/components/typography/zh-title";
import { ZhCaption } from "@/components/typography/zh-caption";
import { getDeckAccent } from "@/lib/deck-accent";

export default async function DecksPage() {
  const userId = await requireUserId();
  const decks = await prisma.deck.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { cards: true } } },
  });

  return (
    <main className="mx-auto max-w-content px-4 py-8 md:px-8 md:py-12">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <ZhCaption zh="我的牌组" en={`/DECKS · ${decks.length} TOTAL`} enFirst />
          <ZhTitle zh="我的牌组" en="MY DECKS" size="h1" />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button asChild>
            <Link href="/decks/new">+ 新建牌组</Link>
          </Button>
          <SignOutButton />
        </div>
      </div>

      {/* List — responsive 1/2/3/4/5 columns. Each tile carries a
          per-deck theme accent: the user's chosen color (from the
          deck settings page), or a hash-derived fallback. The
          `.tile-backlight` utility paints a soft glow UNDER each
          tile via GPU-composited `box-shadow` + static
          `radial-gradient` (no `filter: blur`, no animated paint). */}
      {decks.length === 0 ? (
        <div className="glass-card rounded-xl border-dashed px-6 py-16 text-center">
          <p className="text-base text-muted-foreground">
            还没有牌组。
            <br />
            点击右上角「新建牌组」开始你的第一个牌组。
          </p>
        </div>
      ) : (
        <ul className="grid gap-5 sm:gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {decks.map((deck, index) => {
            const accent = deck.themeColor ?? getDeckAccent(deck.id);
            return (
              <li key={deck.id} className="animate-section-in" style={{ animationDelay: `${index * 80}ms` }}>
                <Link
                  href={`/decks/${deck.id}`}
                  // The accent flows into the backlight via the
                  // CSS variable. Persisted color wins; hash
                  // fallback keeps the gallery readable when the
                  // user hasn't customized yet.
                  style={{ "--deck-accent": accent } as React.CSSProperties}
                  className="tile-backlight group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <div className="glass-card rounded-xl">
                    <div className="flex flex-col gap-3 p-5 sm:p-6">
                      <div className="flex items-start justify-between gap-3">
                        <h2
                          className="text-fluid-h2 font-display font-semibold leading-tight tracking-tight text-balance"
                          style={{ color: `hsl(${accent})` }}
                        >
                          {deck.title}
                        </h2>
                        <span
                          aria-hidden
                          className="shrink-0 translate-y-0.5 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                        >
                          →
                        </span>
                      </div>
                      {deck.description ? (
                        <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                          {deck.description}
                        </p>
                      ) : null}
                      <div className="mt-2 flex items-center justify-between gap-2 border-t border-border/40 pt-3 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                        <span>{deck._count.cards} CARDS</span>
                        <time dateTime={new Date(deck.updatedAt).toISOString()}>
                          {new Date(deck.updatedAt).toLocaleDateString("zh-CN")}
                        </time>
                      </div>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
