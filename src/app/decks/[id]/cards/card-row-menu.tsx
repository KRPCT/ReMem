"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Star, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  toggleFavoriteAction,
  toggleSuspendedAction,
  deleteCardAction,
} from "./actions";

interface CardRowMenuProps {
  cardId: string;
  deckId: string;
  isFavorite: boolean;
  suspended: boolean;
  frontPreview: string;
}

export function CardRowMenu({
  cardId,
  deckId,
  isFavorite,
  suspended,
  frontPreview,
}: CardRowMenuProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const onToggleFavorite = () => {
    startTransition(async () => {
      await toggleFavoriteAction(cardId, deckId);
      router.refresh();
    });
  };

  const onToggleSuspended = () => {
    startTransition(async () => {
      await toggleSuspendedAction(cardId, deckId);
      router.refresh();
    });
  };

  const onConfirmDelete = () => {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("cardId", cardId);
      fd.set("deckId", deckId);
      await deleteCardAction(fd);
      setDeleteOpen(false);
      router.refresh();
    });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="卡片操作菜单"
            disabled={pending}
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="glass-dropdown">
          <DropdownMenuItem asChild>
            <Link href={`/decks/${deckId}/cards/${cardId}/edit`}>编辑</Link>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              onToggleFavorite();
            }}
          >
            <Star className="mr-2 h-4 w-4" aria-hidden />
            {isFavorite ? "取消收藏" : "收藏"}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              onToggleSuspended();
            }}
          >
            {suspended ? (
              <Eye className="mr-2 h-4 w-4" aria-hidden />
            ) : (
              <EyeOff className="mr-2 h-4 w-4" aria-hidden />
            )}
            {suspended ? "取消暂停" : "暂停卡片"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={(e) => {
              e.preventDefault();
              setDeleteOpen(true);
            }}
          >
            删除
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              确认删除卡片「{frontPreview}」？
            </AlertDialogTitle>
            <AlertDialogDescription>
              此操作不可撤销。该卡片的复习记录与字段值将一并删除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={(e) => {
                e.preventDefault();
                onConfirmDelete();
              }}
            >
              {pending ? "删除中..." : "确认删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
