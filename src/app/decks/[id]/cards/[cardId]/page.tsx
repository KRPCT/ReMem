import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/progress";
import { ProgressBadge } from "@/components/ui/progress-badge";
import { ZhCaption } from "@/components/typography/zh-caption";
import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";
import {
  cardTypeDataSchema,
  type CardType,
  type CardTypeData,
} from "@/lib/validation";
import { CardTypeBadge } from "../card-type-badge";
import { FavoriteButton } from "./favorite-button";
import { SuspendButton } from "./suspend-button";
import { DeleteCardDialog } from "./delete-card-dialog";

interface CardDetailPageProps {
  params: Promise<{ id: string; cardId: string }>;
}

function CardTypeInfo({ typeData }: { typeData: CardTypeData }) {
  if (typeData.type === "choice") {
    return (
      <ul className="space-y-1 text-sm">
        {typeData.options.map((opt, i) => (
          <li key={i} className="flex items-center gap-2">
            <span
              className={
                i === typeData.answer
                  ? "font-mono text-emerald-600 dark:text-emerald-400"
                  : "font-mono text-muted-foreground"
              }
            >
              {String.fromCharCode(65 + i)}.
            </span>
            <span>{opt}</span>
            {i === typeData.answer ? (
              <Badge variant="secondary" className="ml-auto">
                正确答案
              </Badge>
            ) : null}
          </li>
        ))}
      </ul>
    );
  }
  if (typeData.type === "multi_choice") {
    return (
      <ul className="space-y-1 text-sm">
        {typeData.options.map((opt, i) => {
          const isAnswer = typeData.answers.includes(i);
          return (
            <li key={i} className="flex items-center gap-2">
              <span
                className={
                  isAnswer
                    ? "font-mono text-emerald-600 dark:text-emerald-400"
                    : "font-mono text-muted-foreground"
                }
              >
                {String.fromCharCode(65 + i)}.
              </span>
              <span>{opt}</span>
              {isAnswer ? (
                <Badge variant="secondary" className="ml-auto">
                  正确答案
                </Badge>
              ) : null}
            </li>
          );
        })}
      </ul>
    );
  }
  if (typeData.type === "fill") {
    return (
      <div className="flex flex-wrap gap-2">
        {typeData.answers.map((a, i) => (
          <Badge key={i} variant="secondary">
            {a}
          </Badge>
        ))}
      </div>
    );
  }
  if (typeData.type === "judge") {
    return (
      <p className="text-sm">
        正确答案:{" "}
        <span className="font-medium">
          {typeData.correct ? "正确" : "错误"}
        </span>
      </p>
    );
  }
  // qa
  return null;
}

function parseTypeData(raw: unknown): CardTypeData {
  const parsed = cardTypeDataSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  // Defensive: an older schema version or a manually-edited row may
  // not match the current discriminated union. Fall back to qa so
  // the page renders something rather than crashing the whole route.
  return { type: "qa" };
}

export default async function CardDetailPage({ params }: CardDetailPageProps) {
  const { id, cardId } = await params;
  const userId = await requireUserId();

  const card = await prisma.card.findFirst({
    where: { id: cardId, deck: { id, userId } },
    include: {
      fields: { include: { field: true } },
      // Phase 08-03: per-card progress is read directly from the
      // Card row (the column updated by answerCard in 08-02).
      // cardState supplies the FSRS metadata for the
      // 稳定性/难度/复习次数/下次到期 fields below.
      cardState: true,
    },
  });
  if (!card) notFound();

  const typeData = parseTypeData(card.typeData);
  const cardPreview =
    (card.frontContent ?? "")
      .replace(/[#*_`~\[\]()!>]+/g, "")
      .slice(0, 30) || "(无内容)";

  return (
    <main className="mx-auto max-w-reading space-y-4 px-4 py-12 md:px-6 md:py-14">
      {/* Sticky action bar (just below the 56px top nav) */}
      <div className="sticky top-[56px] z-10 -mx-4 px-4">
        <Card className="flex items-center justify-between gap-m px-m py-s">
          <div className="flex items-center gap-m">
            <Link
              href={`/decks/${id}`}
              className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              <span className="ml-1">返回牌组</span>
            </Link>
            <CardTypeBadge type={typeData.type as CardType} />
          </div>
          <div className="flex items-center gap-1">
            <FavoriteButton
              cardId={cardId}
              deckId={id}
              isFavorite={card.isFavorite}
            />
            <SuspendButton
              cardId={cardId}
              deckId={id}
              suspended={card.suspended}
            />
            <Button variant="outline" size="sm" asChild>
              <Link href={`/decks/${id}/cards/${cardId}/edit`}>编辑</Link>
            </Button>
            <DeleteCardDialog
              cardId={cardId}
              deckId={id}
              cardPreview={cardPreview}
            />
          </div>
        </Card>
      </div>

      {/* Front content */}
      {card.frontContent ? (
        <Card>
          <CardContent className="p-6">
            <MarkdownRenderer content={card.frontContent} />
          </CardContent>
        </Card>
      ) : null}

      {/* Divider */}
      <div className="my-2 h-px bg-border" />

      {/* Back content */}
      {card.backContent ? (
        <Card>
          <CardContent className="p-6">
            <MarkdownRenderer content={card.backContent} />
          </CardContent>
        </Card>
      ) : null}

      {/*
        Phase 08-03: per-card FSRS 6 progress. Shows a 1px bar +
        tabular-nums badge, plus the 4 FSRS fields the user can
        inspect (stability / difficulty / reps / next-due). The
        state badge is the literal CardState.state string (new /
        learning / review / relearning) — a quick "where is this
        card in the FSRS lifecycle" indicator.
      */}
      <Card>
        <CardContent className="space-y-3 p-6">
          <div className="flex items-center justify-between gap-2">
            <ZhCaption zh="学习进度" en="LEARNING PROGRESS" enFirst />
            <ProgressBadge value={card.progress} />
          </div>
          <ProgressBar
            value={card.progress}
            variant="subtle"
            aria-label="本卡学习进度"
          />
          {card.cardState ? (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 pt-2 font-mono text-xs text-muted-foreground">
              <div className="space-y-0.5">
                <dt>状态</dt>
                <dd className="text-foreground">{card.cardState.state}</dd>
              </div>
              <div className="space-y-0.5">
                <dt>稳定性</dt>
                <dd className="text-foreground">
                  {card.cardState.stability?.toFixed(2) ?? "—"} 天
                </dd>
              </div>
              <div className="space-y-0.5">
                <dt>难度</dt>
                <dd className="text-foreground">
                  {card.cardState.difficulty?.toFixed(2) ?? "—"}
                </dd>
              </div>
              <div className="space-y-0.5">
                <dt>复习次数</dt>
                <dd className="text-foreground">{card.cardState.reps}</dd>
              </div>
              <div className="space-y-0.5 col-span-2">
                <dt>下次到期</dt>
                <dd className="text-foreground">
                  {card.cardState.due
                    ? new Date(card.cardState.due).toLocaleString("zh-CN")
                    : "—"}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-xs text-muted-foreground">
              尚未开始复习,首次评分后这里会出现 FSRS 状态。
            </p>
          )}
        </CardContent>
      </Card>

      {/* Type-specific info */}
      {typeData.type !== "qa" ? (
        <Card>
          <CardContent className="space-y-2 p-6">
            <p className="text-sm font-medium text-muted-foreground">
              题目信息
            </p>
            <CardTypeInfo typeData={typeData} />
          </CardContent>
        </Card>
      ) : null}

      {/* CardField values */}
      {card.fields.length > 0 ? (
        <Card>
          <CardContent className="space-y-1 p-6">
            <p className="text-sm font-medium text-muted-foreground">
              字段值
            </p>
            {card.fields.map((cf) => (
              <p
                key={cf.id}
                className="font-mono text-sm text-muted-foreground"
              >
                {cf.field.name}: {cf.value || "（空）"}
              </p>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </main>
  );
}
