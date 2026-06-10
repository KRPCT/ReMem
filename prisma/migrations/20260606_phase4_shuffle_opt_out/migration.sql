-- Phase 04-06 Feature A: per-card shuffle opt-out.
-- When true, this card's choice/multi_choice options NEVER shuffle,
-- regardless of the deck-level Deck.shuffleOptions setting.
ALTER TABLE "Card" ADD COLUMN "shuffleOptOut" BOOLEAN NOT NULL DEFAULT 0;
