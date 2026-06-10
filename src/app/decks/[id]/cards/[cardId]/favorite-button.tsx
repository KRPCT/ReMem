"use client";

import { useOptimistic, useState, useTransition } from "react";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toggleFavoriteAction } from "../actions";

interface FavoriteButtonProps {
  cardId: string;
  deckId: string;
  isFavorite: boolean;
}

export function FavoriteButton({
  cardId,
  deckId,
  isFavorite,
}: FavoriteButtonProps) {
  // Canonical server-truth state. Updated from the action's returned value
  // after the await so the button reflects the persisted result.
  const [canonical, setCanonical] = useState(isFavorite);
  // Optimistic layer: flips immediately on click, collapses back to
  // canonical once the transition settles (D-05 -- no router.refresh).
  const [optimisticFav, toggleOptimisticFav] = useOptimistic<boolean, void>(
    canonical,
    (current) => !current
  );
  const [, startTransition] = useTransition();

  return (
    <Button
      variant="ghost"
      size="icon"
      disabled={optimisticFav !== canonical}
      aria-label={optimisticFav ? "取消收藏" : "收藏"}
      aria-pressed={optimisticFav}
      onClick={() => {
        startTransition(async () => {
          toggleOptimisticFav();
          try {
            const result = await toggleFavoriteAction(cardId, deckId);
            setCanonical(result.isFavorite);
          } catch {
            // On error, revert to the last known canonical value
            // by leaving canonical unchanged -- useOptimistic collapses
            // back to canonical automatically.
          }
        });
      }}
    >
      <Star
        className={optimisticFav ? "fill-current text-brand" : "text-muted-foreground"}
        aria-hidden
      />
    </Button>
  );
}
