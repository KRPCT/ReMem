import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { ZhTitle } from "@/components/typography/zh-title";
import { FavoritesList } from "./favorites-list.client";

export const dynamic = "force-dynamic";

export default async function FavoritesPage() {
  const userId = await requireUserId();

  const cards = await prisma.card.findMany({
    where: { isFavorite: true, deck: { userId } },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      type: true,
      frontContent: true,
      backContent: true,
      isFavorite: true,
      suspended: true,
      deckId: true,
      deck: { select: { title: true } },
    },
  });

  const rows = cards.map((c) => ({
    id: c.id,
    deckId: c.deckId,
    deckTitle: c.deck.title,
    type: c.type,
    frontContent: c.frontContent,
    backContent: c.backContent,
    isFavorite: c.isFavorite,
    suspended: c.suspended,
  }));

  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-12 md:px-6 md:py-14">
      <div className="space-y-2">
        <Link
          href="/decks"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <span aria-hidden>←</span>
          <span className="ml-1">返回牌组列表</span>
        </Link>
        <ZhTitle zh="收藏夹" en="FAVORITES" size="h1" />
      </div>
      <FavoritesList cards={rows} />
    </main>
  );
}
