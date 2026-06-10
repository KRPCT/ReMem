"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="ghost"
      size="icon"
      disabled={pending}
      aria-label={isFavorite ? "取消收藏" : "收藏"}
      aria-pressed={isFavorite}
      onClick={() => {
        startTransition(async () => {
          await toggleFavoriteAction(cardId, deckId);
          router.refresh();
        });
      }}
    >
      <Star
        className={isFavorite ? "fill-current text-brand" : "text-muted-foreground"}
        aria-hidden
      />
    </Button>
  );
}
