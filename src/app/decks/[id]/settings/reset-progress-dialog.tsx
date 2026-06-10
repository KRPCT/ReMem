"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { resetDeckProgressAction } from "../actions";

interface ResetProgressDialogProps {
  deckId: string;
}

/**
 * "重置学习进度" — clears FSRS scheduling + progress for every card in
 * the deck. Softer destructive treatment than 删除牌组 (outline + brand
 * /destructive tint, not solid) because it keeps the cards; it only
 * rewinds their schedule. Controlled `open` so the dialog closes itself
 * on success after `router.refresh()` repaints the deck's progress.
 */
export function ResetProgressDialog({ deckId }: ResetProgressDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          variant="outline"
          className="gap-2 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <RotateCcw className="h-4 w-4" aria-hidden />
          重置学习进度
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>重置该牌组的学习进度？</AlertDialogTitle>
          <AlertDialogDescription>
            所有卡片将回到「新卡」状态：清空 FSRS 调度（稳定性 / 难度 / 复习
            次数）、复习历史，以及每张卡的学习进度百分比。卡片内容、模板、
            收藏均保留。此操作不可撤销。
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <p
            className="font-mono text-xs text-destructive"
            role="alert"
            aria-live="polite"
          >
            {error}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>取消</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={(e) => {
              e.preventDefault();
              setError(null);
              startTransition(async () => {
                const fd = new FormData();
                fd.set("id", deckId);
                const res = await resetDeckProgressAction(null, fd);
                if (res?.error) {
                  setError(res.error);
                  return;
                }
                setOpen(false);
                router.refresh();
              });
            }}
          >
            {pending ? "重置中..." : "确认重置"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
