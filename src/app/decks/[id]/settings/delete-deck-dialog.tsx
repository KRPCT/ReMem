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
import { deleteDeckAction } from "../actions";

interface DeleteDeckDialogProps {
  deckId: string;
  deckTitle: string;
}

export function DeleteDeckDialog({ deckId, deckTitle }: DeleteDeckDialogProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive">删除牌组</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>确认删除牌组「{deckTitle}」？</AlertDialogTitle>
          <AlertDialogDescription>
            此操作不可撤销。所有卡片、字段、模板都将一并删除。
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
                fd.set("id", deckId);
                await deleteDeckAction(fd);
                router.push("/decks");
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
