import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { cardTypeDataSchema, type NoteTypeField } from "@/lib/validation";
import { Card, CardContent } from "@/components/ui/card";
import { ZhTitle } from "@/components/typography/zh-title";
import { CardForm, type CardFormInitial } from "../../new/card-form";

interface EditCardPageProps {
  params: Promise<{ id: string; cardId: string }>;
}

export default async function EditCardPage({ params }: EditCardPageProps) {
  const { id, cardId } = await params;
  const userId = await requireUserId();

  const card = await prisma.card.findFirst({
    where: { id: cardId, deck: { id, userId } },
    include: {
      fields: { include: { field: true } },
      deck: {
        include: {
          noteType: {
            include: {
              fields: { orderBy: { ord: "asc" } },
            },
          },
        },
      },
    },
  });
  if (!card?.deck.noteType) notFound();

  // Parse typeData via Zod; on parse failure default to qa.
  const parsedType = cardTypeDataSchema.safeParse(card.typeData);
  const typeData = parsedType.success
    ? parsedType.data
    : ({ type: "qa" } as const);

  const noteTypeFields: NoteTypeField[] = card.deck.noteType.fields.map(
    (f) => ({ id: f.id, name: f.name })
  );

  const initial: CardFormInitial = {
    id: card.id,
    type: card.type as CardFormInitial["type"],
    frontContent: card.frontContent ?? "",
    backContent: card.backContent ?? "",
    typeData,
    fields: Object.fromEntries(
      card.fields.map((f) => [f.field.name, f.value])
    ),
    isFavorite: card.isFavorite,
    suspended: card.suspended,
    shuffleOptOut: card.shuffleOptOut,
  };

  return (
    <main className="mx-auto max-w-form space-y-4 px-4 py-12 md:max-w-2xl md:px-6 md:py-14 lg:max-w-3xl">
      <div className="space-y-2">
        <Link
          href={`/decks/${id}/cards/${cardId}`}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <span aria-hidden>←</span>
          <span className="ml-1">返回卡片详情</span>
        </Link>
        <ZhTitle zh="编辑卡片" en="EDIT CARD" size="h1" />
      </div>
      <Card>
        <CardContent className="p-l md:p-xl">
          <CardForm
            mode="edit"
            deckId={id}
            noteTypeFields={noteTypeFields}
            initial={initial}
          />
        </CardContent>
      </Card>
    </main>
  );
}
