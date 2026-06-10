/**
 * Phase 09 (STATS-03): card-state distribution data layer.
 *
 * Buckets a deck's cards into the four mutually-exclusive FSRS states
 * for the donut chart. PURE — operates on the already-fetched
 * `cardsWithState` array (deck page, decks/[id]/page.tsx:71-74), which
 * is already scoped to `deckId` + `suspended: false`. `CardState` has
 * no `deckId` / `suspended` column, so there is nothing deck- or
 * suspension-related to handle here (09-RESEARCH.md § F2/F3).
 *
 * Bucket semantics (D-10 / D-11):
 *   - no CardState row OR state "new" → new   (unstarted card, D-11)
 *   - "learning"                      → learning
 *   - "review"                        → review
 *   - "relearning"                    → lapsed (currently re-learning a
 *                                       failed card — NOT the historical
 *                                       `lapses > 0` count, D-10)
 *
 * Every card increments exactly one bucket, so the four buckets are
 * mutually exclusive and always sum to `total`.
 */

export interface CardStateDistribution {
  new: number;
  learning: number;
  review: number;
  lapsed: number;
  total: number;
}

/** Minimal per-card shape needed here (structurally matches `cardsWithState`). */
export interface CardWithStateLike {
  cardState: { state: string } | null;
}

export function bucketCardStates(
  cards: CardWithStateLike[]
): CardStateDistribution {
  const dist: CardStateDistribution = {
    new: 0,
    learning: 0,
    review: 0,
    lapsed: 0,
    total: cards.length,
  };

  for (const card of cards) {
    switch (card.cardState?.state) {
      case "learning":
        dist.learning += 1;
        break;
      case "review":
        dist.review += 1;
        break;
      case "relearning":
        dist.lapsed += 1;
        break;
      // null CardState, "new", or any unknown state → new bucket (D-11).
      // Folding unknown values into `new` keeps the buckets summing to total.
      default:
        dist.new += 1;
        break;
    }
  }

  return dist;
}
