"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { AuthError } from "next-auth";
import { ZodError } from "zod";
import { auth } from "../../../../auth";
import { prisma } from "@/lib/prisma";
import { deckCreateSchema, noteTypeJsonSchema } from "@/lib/validation";
import { validatePlaceholders } from "@/lib/templates";

export type CreateDeckState = {
  error?: string;
  fieldErrors?: Record<string, string>;
} | null;

export async function createDeckAction(
  _prev: CreateDeckState,
  formData: FormData
): Promise<CreateDeckState> {
  try {
    // Defense-in-depth: middleware already protects /decks/* but a server
    // action that doesn't re-check auth would be a CSRF footgun.
    const session = await auth();
    if (!session?.user?.id) return { error: "未登录" };

    // 1) Hidden noteTypeJson field
    const raw = formData.get("noteTypeJson");
    if (typeof raw !== "string") return { error: "模板数据缺失" };
    let noteTypeJson: unknown;
    try {
      noteTypeJson = JSON.parse(raw);
    } catch {
      return { error: "默认模板数据损坏" };
    }

    // 2) Deck title + description
    const deckParsed = deckCreateSchema.safeParse({
      title: formData.get("title"),
      description: (formData.get("description") as string) || "",
    });
    if (!deckParsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of deckParsed.error.issues) {
        fieldErrors[issue.path.join(".")] = issue.message;
      }
      return { fieldErrors };
    }

    // 3) NoteType shape
    const noteTypeParsed = noteTypeJsonSchema.safeParse(noteTypeJson);
    if (!noteTypeParsed.success) {
      return {
        error:
          "默认模板格式有误: " +
          (noteTypeParsed.error.issues[0]?.message ?? "unknown"),
      };
    }

    // 4) Placeholder validation (D-03: validate, don't substitute)
    const fieldNames = new Set(noteTypeParsed.data.fields.map((f) => f.name));
    for (const t of noteTypeParsed.data.templates) {
      const bad =
        validatePlaceholders(t.qfmt, fieldNames) ??
        validatePlaceholders(t.afmt, fieldNames);
      if (bad) {
        return { error: `未定义字段: ${bad}（在 ${t.name}）` };
      }
    }

    // 5) Atomic Deck + NoteType + Fields + CardTemplates create
    const deck = await prisma.deck.create({
      data: {
        userId: session.user.id,
        title: deckParsed.data.title,
        description: deckParsed.data.description?.length
          ? deckParsed.data.description
          : null,
        noteType: {
          create: {
            userId: session.user.id,
            name: noteTypeParsed.data.name,
            fields: { create: noteTypeParsed.data.fields },
            templates: { create: noteTypeParsed.data.templates },
          },
        },
      },
    });

    revalidatePath("/decks");
    redirect(`/decks/${deck.id}`);
  } catch (e) {
    // Re-throw NEXT_REDIRECT so Next.js can perform the navigation. We never
    // want a generic catch to swallow the redirect (Pitfall 9).
    if (e instanceof AuthError || e instanceof ZodError) throw e;
    throw e;
  }
}
