"use client";

import Link from "next/link";
import { useState } from "react";
import { Eye, EyeOff, Star } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { CardRowMenu } from "./card-row-menu";
import { CardBody } from "./card-body";
import { stripMarkdown } from "@/lib/strip-markdown";

export interface CardDetail {
  id: string;
  type: string;
  frontContent: string | null;
  backContent: string | null;
  isFavorite: boolean;
  suspended: boolean;
  updatedAt: Date | string;
  /** Raw JSON parsed client-side by `CardBody`. */
  typeData: unknown;
}

interface CardDetailModalProps {
  deckId: string;
  card: CardDetail | null;
  onClose: () => void;
}

/**
 * Centered frosted-glass modal showing a single card's full content.
 *
 * DECK-03 from the Phase 5 brief: "click a gallery card opens a
 * focused study or preview overlay" — this is the "preview overlay"
 * half. The user stays on the current page; the modal floats over
 * the gallery.
 *
 * Per the Phase 5 redesign: the answer is **hidden by default** and
 * revealed via the "显示答案" button at the bottom. Different
 * question types render the reveal differently:
 *
 *   - **qa**: back content appended below the question
 *   - **choice** / **multi_choice**: the correct option(s) get a
 *     green highlight; wrong options fade
 *   - **judge**: the correct button (正确/错误) gets a green highlight
 *   - **fill**: the `____` blank in the question is filled in with
 *     the first acceptable answer, and the equivalent-answers
 *     panel shows below
 *
 * The modal re-uses `<CardRowMenu>` (the same kebab + actions as
 * the row view) so favorite / suspend / delete / edit stay
 * one-click away. The "编辑" link is the only way out of the modal
 * for an edit operation — it routes to the card edit page.
 */
export function CardDetailModal({ deckId, card, onClose }: CardDetailModalProps) {
  const [showAnswer, setShowAnswer] = useState(false);

  // Reset reveal state when the card changes (or the modal closes).
  // Without this, switching cards would leak the previous reveal
  // into the next card's body.
  // We can't use useEffect for a derived state, so the parent passes
  // `card` and the local state is intentionally fresh on remount.
  // (Remount is guaranteed because the parent unmounts the modal
  // when `activeCardId` is null — see CardGallery/CardList.)

  if (!card) {
    return null;
  }

  const strippedFront = stripMarkdown(card.frontContent ?? "").slice(0, 40);

  return (
    <Modal
      open
      onClose={onClose}
      title={strippedFront || "（无内容）"}
      description="卡片预览"
    >
      <div className="space-y-4">
        {/* Status row: type badge + favorite / suspend indicators +
            row menu (favorite / suspend / delete). The show/hide
            answer button lives at the bottom of the modal so the
            user can scan the question first. */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-muted-foreground">
            {card.isFavorite ? (
              <Star
                className="h-4 w-4 fill-current text-brand"
                aria-label="已收藏"
              />
            ) : null}
            {card.suspended ? (
              <span
                className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.18em]"
                aria-label="已暂停"
              >
                暂停
              </span>
            ) : null}
          </div>
          <CardRowMenu
            cardId={card.id}
            deckId={deckId}
            isFavorite={card.isFavorite}
            suspended={card.suspended}
            frontPreview={strippedFront}
          />
        </div>

        <CardBody
          type={card.type}
          frontContent={card.frontContent}
          backContent={card.backContent}
          typeData={card.typeData}
          showAnswer={showAnswer}
        />

        <div className="flex flex-wrap items-center justify-end gap-s border-t border-border/40 pt-4">
          <Button variant="ghost" size="sm" onClick={onClose}>
            关闭
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/decks/${deckId}/cards/${card.id}/edit`}>
              编辑
            </Link>
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => setShowAnswer((v) => !v)}
            aria-pressed={showAnswer}
          >
            {showAnswer ? (
              <>
                <EyeOff className="h-4 w-4" aria-hidden />
                <span className="ml-1">隐藏答案</span>
              </>
            ) : (
              <>
                <Eye className="h-4 w-4" aria-hidden />
                <span className="ml-1">显示答案</span>
              </>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default CardDetailModal;
