-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Card" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deckId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'qa',
    "frontContent" TEXT,
    "backContent" TEXT,
    "typeData" JSONB,
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "suspended" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Card_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "Deck" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Card" ("createdAt", "deckId", "id", "updatedAt") SELECT "createdAt", "deckId", "id", "updatedAt" FROM "Card";
DROP TABLE "Card";
ALTER TABLE "new_Card" RENAME TO "Card";
CREATE INDEX "Card_deckId_idx" ON "Card"("deckId");
CREATE INDEX "Card_deckId_type_idx" ON "Card"("deckId", "type");
CREATE INDEX "Card_deckId_suspended_idx" ON "Card"("deckId", "suspended");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
