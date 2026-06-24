import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Account-level UX preferences (B2). Three global toggles that are NOT
 * per-deck scheduler semantics (those live on StudyPlan). Stored one
 * row per user (UserSettings.userId @unique); a user with no row yet
 * falls back to these defaults everywhere the flags are read.
 */
export type UserPrefs = {
  /** Show the post-rating "next review in N days" line in study. */
  showNextReviewTime: boolean;
  /** Default the gallery preview modal to answer-revealed. */
  browseDefaultShowAnswer: boolean;
  /** Auto-fill cloze blanks on reveal (false = per-blank tap-to-reveal). */
  autoRevealCloze: boolean;
};

export const USER_PREFS_DEFAULTS: UserPrefs = {
  showNextReviewTime: false,
  browseDefaultShowAnswer: false,
  autoRevealCloze: true,
};

/**
 * Read a user's preferences, falling back to the column defaults when
 * no UserSettings row exists (lazy creation — the row is only written
 * on the first /settings save). The `select` is explicit so the shape
 * matches `UserPrefs` exactly with no leaked columns.
 */
export async function getUserPrefs(userId: string): Promise<UserPrefs> {
  const row = await prisma.userSettings.findUnique({
    where: { userId },
    select: {
      showNextReviewTime: true,
      browseDefaultShowAnswer: true,
      autoRevealCloze: true,
    },
  });
  return row ?? USER_PREFS_DEFAULTS;
}
