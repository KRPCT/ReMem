-- B2 + Deck-share (2026-06-24).
--
-- 1) UserSettings — account-level UX preferences (one row per user).
--    Three global toggles that are NOT per-deck scheduler semantics
--    (those live on StudyPlan): post-rating interval line, gallery
--    default-reveal, and cloze auto-reveal. A user with no row falls
--    back to these column defaults wherever the flags are read, so the
--    table is lazily populated by the /settings form's first save.
--
-- 2) Deck.shareToken — nullable, unique. When set, anyone with the link
--    can preview the deck at /share/[token] and deep-clone it into their
--    own account with FRESH FSRS state (no CardState/ReviewLog copied).
--    null = private. Multiple NULLs are allowed under the unique index
--    (SQLite treats NULLs as distinct), so existing decks are unaffected.

CREATE TABLE "UserSettings" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "showNextReviewTime" BOOLEAN NOT NULL DEFAULT false,
  "browseDefaultShowAnswer" BOOLEAN NOT NULL DEFAULT false,
  "autoRevealCloze" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "UserSettings_userId_key" ON "UserSettings"("userId");

ALTER TABLE "Deck" ADD COLUMN "shareToken" TEXT;
CREATE UNIQUE INDEX "Deck_shareToken_key" ON "Deck"("shareToken");
