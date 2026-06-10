import Link from "next/link";
import { requireUserId } from "@/lib/auth-helpers";
import { createBasicNoteTypeJson } from "@/lib/note-type-defaults";
import { Card, CardContent } from "@/components/ui/card";
import { ZhTitle } from "@/components/typography/zh-title";
import { NewDeckForm } from "./new-deck-form";

export default async function NewDeckPage() {
  // Force auth check; userId not used directly here — server action does the
  // ownership write.
  await requireUserId();

  return (
    <main className="mx-auto max-w-2xl space-y-4 px-4 py-12 md:px-6 md:py-14">
      <Link
        href="/decks"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <span aria-hidden>←</span>
        <span className="ml-1">返回牌组列表</span>
      </Link>
      <Card>
        <CardContent className="space-y-6 p-6">
          <ZhTitle zh="新建牌组" en="NEW DECK" size="h2" />
          <NewDeckForm noteTypeJson={createBasicNoteTypeJson()} />
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            提示 · 将使用默认 Basic 模板（Front / Back 字段）。创建后可在设置页修改。
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
