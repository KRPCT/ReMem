"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toggleSuspendedAction } from "../actions";

interface SuspendButtonProps {
  cardId: string;
  deckId: string;
  suspended: boolean;
}

export function SuspendButton({ cardId, deckId, suspended }: SuspendButtonProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="ghost"
      size="icon"
      disabled={pending}
      aria-label={suspended ? "取消暂停" : "暂停卡片"}
      aria-pressed={suspended}
      onClick={() => {
        startTransition(async () => {
          await toggleSuspendedAction(cardId, deckId);
          router.refresh();
        });
      }}
    >
      {suspended ? (
        <Eye className="text-muted-foreground" aria-hidden />
      ) : (
        <EyeOff className="text-muted-foreground" aria-hidden />
      )}
    </Button>
  );
}
