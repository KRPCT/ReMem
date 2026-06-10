"use client";

import { useOptimistic, useState, useTransition } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toggleSuspendedAction } from "../actions";

interface SuspendButtonProps {
  cardId: string;
  deckId: string;
  suspended: boolean;
}

export function SuspendButton({ cardId, deckId, suspended }: SuspendButtonProps) {
  // Canonical server-truth state. Updated from the action's returned value
  // after the await so the button reflects the persisted result.
  const [canonical, setCanonical] = useState(suspended);
  // Optimistic layer: flips immediately on click, collapses back to
  // canonical once the transition settles (D-05 -- no router.refresh).
  const [optimisticSuspended, toggleOptimisticSuspended] = useOptimistic<
    boolean,
    void
  >(canonical, (current) => !current);
  const [, startTransition] = useTransition();

  return (
    <Button
      variant="ghost"
      size="icon"
      disabled={optimisticSuspended !== canonical}
      aria-label={optimisticSuspended ? "取消暂停" : "暂停卡片"}
      aria-pressed={optimisticSuspended}
      onClick={() => {
        startTransition(async () => {
          toggleOptimisticSuspended();
          try {
            const result = await toggleSuspendedAction(cardId, deckId);
            setCanonical(result.suspended);
          } catch {
            // On error, revert to the last known canonical value
            // by leaving canonical unchanged -- useOptimistic collapses
            // back to canonical automatically.
          }
        });
      }}
    >
      {optimisticSuspended ? (
        <Eye className="text-muted-foreground" aria-hidden />
      ) : (
        <EyeOff className="text-muted-foreground" aria-hidden />
      )}
    </Button>
  );
}
