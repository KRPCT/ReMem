import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { Card, CardContent } from "@/components/ui/card";
import { ZhTitle } from "@/components/typography/zh-title";
import { ZhCaption } from "@/components/typography/zh-caption";
import { getDeckAccent } from "@/lib/deck-accent";
import { STUDY_PLAN_DEFAULTS } from "@/lib/fsrs";
import { SettingsForm } from "./settings-form";
import { DeleteDeckDialog } from "./delete-deck-dialog";
import { ImportCardsForm } from "./import-cards-form";
import { DeckColorForm } from "./deck-color-form";
import { StudyPlanForm } from "./study-plan-form";
import { ResetProgressDialog } from "./reset-progress-dialog";
import { SettingsModeToggle } from "./settings-mode-toggle";

interface DeckSettingsPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ import?: string }>;
}

export default async function DeckSettingsPage({
  params,
  searchParams,
}: DeckSettingsPageProps) {
  const { id } = await params;
  const userId = await requireUserId();

  const deck = await prisma.deck.findFirst({
    where: { id, userId },
  });
  if (!deck) notFound();

  // D-15: coerce to "simple" | "pro" — fallback "simple" for null/unknown.
  const mode: "simple" | "pro" =
    deck.settingsMode === "pro" ? "pro" : "simple";

  // Part C: ?import=1 deep-link from deck detail page. Shows the
  // batch-import block even in simple mode so users can always reach
  // the importer via the direct link without switching to pro mode.
  const forceImport = (await searchParams).import === "1";

  // Hash-derived fallback so the form can show what the user
  // would get if they reset to the default.
  const fallbackAccent = getDeckAccent(deck.id);

  // Phase 08-01: fetch the deck's StudyPlan so the form can pre-fill
  // the last-persisted values. Phase 2 seeded a row at deck-creation
  // time, so most decks have one; the merge below keeps the form
  // safe in case a future deck-creation flow skips the seed.
  // Phase 08-04: include firstSessionTargetProgress.
  const studyPlan = await prisma.studyPlan.findUnique({
    where: { deckId: id },
  });
  const initialPlan = studyPlan
    ? {
        newPerDay: studyPlan.newPerDay,
        reviewsPerDay: studyPlan.reviewsPerDay,
        requestRetention: studyPlan.requestRetention,
        enableFuzz: studyPlan.enableFuzz,
        enableShortTerm: studyPlan.enableShortTerm,
        firstSessionTargetProgress: studyPlan.firstSessionTargetProgress,
        ratingButtons: studyPlan.ratingButtons,
        newRememberAsEasy: studyPlan.newRememberAsEasy,
      }
    : {
        ...STUDY_PLAN_DEFAULTS,
        requestRetention: 0.9,
        enableFuzz: true,
        enableShortTerm: true,
        firstSessionTargetProgress: 0.8,
        ratingButtons: 4,
        newRememberAsEasy: false,
      };

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-12 md:px-6 md:py-14">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href={`/decks/${deck.id}`}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <span aria-hidden>←</span>
          <span className="ml-1">返回牌组详情</span>
        </Link>
      </div>

      <div>
        <ZhTitle zh="牌组设置" en="DECK SETTINGS" size="h1" />
      </div>

      {/* D-16: simple|专业 segmented toggle — always visible at the top */}
      <SettingsModeToggle deckId={deck.id} mode={mode} />

      {/* ── Always shown: 基本信息 ─────────────────────────────────── */}
      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="space-y-1">
            <ZhCaption zh="基本信息" en="BASIC INFO" enFirst />
            <p className="text-sm text-muted-foreground">
              修改牌组的标题与描述。
            </p>
          </div>
          <SettingsForm
            deck={{
              id: deck.id,
              title: deck.title,
              description: deck.description,
              shuffleOptions: deck.shuffleOptions,
            }}
          />
        </CardContent>
      </Card>

      {/* ── Pro-only blocks ────────────────────────────────────────── */}
      {mode === "pro" && (
        <Card>
          <CardContent className="space-y-4 p-6">
            <div className="space-y-1">
              <ZhCaption zh="主题色" en="THEME COLOR" enFirst />
              <p className="text-sm text-muted-foreground">
                选 8 调色板中的颜色，或自定义。控制牌组卡片下方的背光强度与色调。
                留空时使用哈希派生的默认色。
              </p>
            </div>
            <DeckColorForm
              deckId={deck.id}
              currentColor={deck.themeColor}
              fallbackColor={fallbackAccent}
            />
          </CardContent>
        </Card>
      )}

      {/* ── 批量导入卡片: pro always, simple via ?import=1 deep-link ── */}
      {(mode === "pro" || forceImport) && (
        <Card id="batch-import">
          <CardContent className="space-y-4 p-6">
            <div className="space-y-1">
              <ZhCaption zh="批量导入卡片" en="BATCH IMPORT CARDS" enFirst />
              <p className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
                按卡片类型批量导入 Markdown 格式的卡片内容。
              </p>
            </div>
            <ImportCardsForm deckId={deck.id} />
          </CardContent>
        </Card>
      )}

      {/* ── Always shown: 学习计划 ─────────────────────────────────── */}
      {/* D-02: simpleMode hides the 4 advanced FSRS fields in the form;
          the 6 hidden inputs still submit so saved values are preserved. */}
      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="space-y-1">
            <ZhCaption zh="学习计划" en="STUDY PLAN" enFirst />
            <p className="text-sm text-muted-foreground">
              调整每日学习上限与 FSRS 调度参数。修改后会立即影响下一队列大小。
            </p>
          </div>
          <StudyPlanForm
            deckId={deck.id}
            initial={initialPlan}
            simpleMode={mode === "simple"}
          />
        </CardContent>
      </Card>

      {/* ── Pro-only: 重置 + 危险操作 ─────────────────────────────── */}
      {mode === "pro" && (
        <>
          <Card>
            <CardContent className="space-y-4 p-6">
              <div className="space-y-1">
                <ZhCaption zh="重置学习进度" en="RESET PROGRESS" enFirst />
                <p className="text-sm text-muted-foreground">
                  将本牌组所有卡片的 FSRS 调度与学习进度清零，卡片回到「新卡」
                  状态。卡片内容、模板、收藏均保留。适合修复历史脏数据或重新开始
                  一轮学习。
                </p>
              </div>
              <ResetProgressDialog deckId={deck.id} />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-4 p-6">
              <div className="space-y-1">
                <ZhCaption zh="危险操作" en="DANGER ZONE" enFirst />
                <p className="text-sm text-muted-foreground">
                  删除牌组会级联删除其所有 NoteType、字段、卡片模板以及未来添加的卡片。
                </p>
              </div>
              <DeleteDeckDialog deckId={deck.id} deckTitle={deck.title} />
            </CardContent>
          </Card>
        </>
      )}
    </main>
  );
}
