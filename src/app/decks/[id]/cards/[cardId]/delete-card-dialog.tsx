"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
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
import { deleteCardAction } from "../actions";

interface DeleteCardDialogProps {
  cardId: string;
  deckId: string;
  cardPreview: string;
}

export function DeleteCardDialog({
  cardId,
  deckId,
  cardPreview,
}: DeleteCardDialogProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" size="sm">
          删除
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>确认删除卡片「{cardPreview}」？</AlertDialogTitle>
          <AlertDialogDescription>
            此操作不可撤销。该卡片的复习记录与字段值将一并删除。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={(e) => {
              e.preventDefault();
              startTransition(async () => {
                const fd = new FormData();
                fd.set("cardId", cardId);
                fd.set("deckId", deckId);
                await deleteCardAction(fd);
                router.push(`/decks/${deckId}`);
                router.refresh();
              });
            }}
          >
            {pending ? "删除中..." : "确认删除"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
