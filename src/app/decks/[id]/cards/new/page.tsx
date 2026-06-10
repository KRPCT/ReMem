import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import type { NoteTypeField } from "@/lib/validation";
import { Card, CardContent } from "@/components/ui/card";
import { ZhTitle } from "@/components/typography/zh-title";
import { CardForm } from "./card-form";

interface NewCardPageProps {
  params: Promise<{ id: string }>;
}

export default async function NewCardPage({ params }: NewCardPageProps) {
  const { id } = await params;
  const userId = await requireUserId();

  const deck = await prisma.deck.findFirst({
    where: { id, userId },
    include: {
      noteType: {
        include: {
          fields: { orderBy: { ord: "asc" } },
        },
      },
    },
  });
  if (!deck?.noteType) notFound();

  const noteTypeFields: NoteTypeField[] = deck.noteType.fields.map((f) => ({
    id: f.id,
    name: f.name,
  }));

  return (
    <main className="mx-auto max-w-form space-y-4 px-4 py-12 md:max-w-2xl md:px-6 md:py-14 lg:max-w-3xl">
      <div className="space-y-2">
        <Link
          href={`/decks/${id}`}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <span aria-hidden>←</span>
          <span className="ml-1">返回牌组详情</span>
        </Link>
        <ZhTitle zh="新建卡片" en="NEW CARD" size="h1" />
      </div>
      <Card>
        <CardContent className="p-l md:p-xl">
          <CardForm mode="create" deckId={id} noteTypeFields={noteTypeFields} />
        </CardContent>
      </Card>
    </main>
  );
}
