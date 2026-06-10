-- Add Deck.shuffleOptions (Phase 04-05: move the per-card shuffle
-- toggle to a deck-level setting). Default true preserves the current
-- behavior for existing rows.
ALTER TABLE "Deck" ADD COLUMN "shuffleOptions" BOOLEAN NOT NULL DEFAULT 1;
