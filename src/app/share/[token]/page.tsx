import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { auth } from "../../../../auth";
import { ZhTitle } from "@/components/typography/zh-title";
import { ZhCaption } from "@/components/typography/zh-caption";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ImportSharedDeck } from "./import-shared-deck";

// Public route (see PUBLIC_GLOBS in src/middleware.ts). Auth + token
// lookup make it dynamic; never statically cached.
export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = {
  qa: "问答",
  choice: "单选",
  multi_choice: "多选",
  fill: "填空",
  judge: "判断",
};

interface SharePageProps {
  params: Promise<{ token: string }>;
}

export default async function SharePage({ params }: SharePageProps) {
  const { token } = await params;
  const session = await auth();
  const isLoggedIn = !!session?.user?.id;

  const deck = await prisma.deck.findUnique({
    where: { shareToken: token },
    select: {
      id: true,
      title: true,
      description: true,
      _count: { select: { cards: true } },
    },
  });

  // Invalid / revoked link — friendly message rather than a bare 404.
  if (!deck) {
    return (
      <main className="mx-auto max-w-reading space-y-6 px-4 py-16 md:px-6">
        <div className="glass-card space-y-4 rounded-xl border-dashed px-6 py-16 text-center">
          <ZhTitle zh="链接无效" en="LINK NOT FOUND" size="h2" />
          <p
            className="text-sm"
            style={{ color: "hsl(var(--muted-foreground))" }}
          >
            这个分享链接不存在或已被停用。
          </p>
          <Link href="/" className="text-sm text-brand hover:underline">
            返回首页
          </Link>
        </div>
      </main>
    );
  }

  const byType = await prisma.card.groupBy({
    by: ["type"],
    where: { deckId: deck.id },
    _count: { _all: true },
  });

  return (
    <main className="mx-auto max-w-reading space-y-6 px-4 py-12 md:px-6 md:py-14">
      <div className="space-y-2">
        <ZhCaption zh="分享的牌组" en="/SHARED DECK" enFirst />
        <ZhTitle zh={deck.title} en="SHARED DECK" size="h1" />
      </div>

      <Card>
        <CardContent className="space-y-4 p-6">
          {deck.description ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed">
              {deck.description}
            </p>
          ) : (
            <p className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
              （无描述）
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="font-mono text-xs">
              共 {deck._count.cards} 张卡片
            </Badge>
            {byType.map((t) => (
              <Badge key={t.type} variant="outline" className="font-mono text-xs">
                {TYPE_LABEL[t.type] ?? t.type} · {t._count._all}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3 rounded-xl border border-dashed p-6"
           style={{ borderColor: "hsl(var(--border))" }}>
        <p className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
          导入会把这套牌组复制到你的账户（卡片 + 模板的一次性快照）。复制后与原牌组
          相互独立——你的复习记录、学习进度都从零开始，原作者的进度不会带过来。
        </p>
        <ImportSharedDeck token={token} isLoggedIn={isLoggedIn} />
      </div>
    </main>
  );
}
