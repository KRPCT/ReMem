"use server";

import { revalidatePath } from "next/cache";
import { auth } from "../../../auth";
import { prisma } from "@/lib/prisma";

export type UserSettingsState = {
  ok?: true;
  error?: string;
} | null;

/**
 * Persist the three account-level UX preferences (B2). The /settings
 * form posts all three booleans as "true"/"false" strings (mirrors the
 * study-plan form's hidden-input convention). Single-row upsert keyed on
 * userId — the first save materializes the row; later saves update it.
 *
 * The browse / cloze flags are read by deck + study pages, so we
 * revalidate /decks (a fresh navigation reflects the new value). No
 * ownership check is needed beyond auth: the row is keyed on the
 * authenticated userId, so a user can only ever write their own row.
 */
export async function updateUserSettingsAction(
  _prev: UserSettingsState,
  fd: FormData
): Promise<UserSettingsState> {
  const session = await auth();
  if (!session?.user?.id) return { error: "未登录" };

  const data = {
    showNextReviewTime: fd.get("showNextReviewTime") === "true",
    browseDefaultShowAnswer: fd.get("browseDefaultShowAnswer") === "true",
    autoRevealCloze: fd.get("autoRevealCloze") === "true",
  };

  try {
    await prisma.userSettings.upsert({
      where: { userId: session.user.id },
      create: { userId: session.user.id, ...data },
      update: data,
    });
    revalidatePath("/settings");
    revalidatePath("/decks");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "未知错误" };
  }
}
