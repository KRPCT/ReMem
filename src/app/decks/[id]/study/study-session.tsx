"use client";

import { useState, useTransition, useMemo, useCallback, useOptimistic } from "react";
import Link from "next/link";
import { Heart, Filter, Undo2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ZhTitle } from "@/components/typography/zh-title";
import { cn } from "@/lib/utils";
import { CardBody } from "../cards/card-body";
import {
  answerCardAction,
  toggleFavoriteStudyAction,
  undoCardAction,
} from "./actions";

/**
 * 简化版卡片载荷 —— 服务端只把 client 渲染需要的字段投到这里。
 * `typeData` 是非 qa 题型的答案所在(选项 / 填空答案 / 判断正误);
 * qa 题型不带 typeData。CardBody 内部用 zod 解析 + 安全兜底。
 */
export interface StudyCard {
  cardId: string;
  type: string;
  frontContent: string | null;
  backContent: string | null;
  typeData: unknown;
  /**
   * Phase 7-03: initial favorite state for this card. The page
   * (07-02) selects it from the `Card` table and includes it on
   * every queue item so the Heart button can render with the
   * correct fill on first render. Client mutations update
   * `favorites` state in place; this field is the seed.
   */
  isFavorite: boolean;
  /**
   * Phase 08-02: per-card FSRS 6 progress (0-1 float). Server
   * (study/page.tsx) selects it from `Card.progress` and seeds
   * the client mirror. The session updates it in place from
   * `answerCardAction.newState.progress` after each rating so
   * the top-of-card hairline bar reflects the post-answer value
   * without a round-trip.
   */
  progress: number;
}

interface StudySessionProps {
  deckId: string;
  mode: "normal" | "cram";
  initialQueue: StudyCard[];
  /**
   * Phase 7-02: whether the queue is filtered to favorites only
   * (driven by `?favorites=1` on the study URL). The page resolves
   * this; 07-03 will surface it in the UI (heart icon, toggle).
   */
  favoritesOnly?: boolean;
  /**
   * Phase 7-02: total favorited non-suspended cards in the deck
   * (cap before). Surfaced in the UI as "N favorites" affordance.
   */
  totalFavorites?: number;
}

// Phase 8 (re-exec): in-session re-test placement for a card that didn't
// reach the threshold. It re-appears between MIN_GAP and MAX_GAP cards
// ahead — far enough not to be immediate ("不要立马"), close enough not
// to be dumped at the very back or too far away. Capped per card so a
// card the user keeps failing can't loop the session indefinitely (its
// FSRS due date schedules the next look after the cap).
const REQUEUE_MIN_GAP = 2;
const REQUEUE_MAX_GAP = 6;
const REQUEUE_MAX_PER_CARD = 3;

/**
 * Pure helper: where to re-insert a re-tested card. Given the current
 * index and queue length, returns a splice position that is a random
 * REQUEUE_MIN_GAP..REQUEUE_MAX_GAP cards after the next card, clamped to
 * the queue end (when the queue is too short to honor the gap, it lands
 * at the back — the only option left). `rand` is injected so the
 * placement is unit-testable.
 */
export function requeuePosition(
  index: number,
  queueLength: number,
  rand: () => number
): number {
  const span = REQUEUE_MAX_GAP - REQUEUE_MIN_GAP + 1;
  const gap = REQUEUE_MIN_GAP + Math.floor(rand() * span);
  return Math.min(index + 1 + gap, queueLength);
}

/**
 * Phase 7 MVP —— 学习会话客户端组件(declarative React)。
 *
 * 状态机:
 *   - index: 当前卡在队列里的位置
 *   - revealed: 当前卡是否已翻面
 *   - judgment: (interactive) 用户的自评结果
 *   - redoCount: 因 "Again" 被重新入队的卡片数
 *   - lastAnsweredCardId: 最近一次成功评分的卡片(用于撤回)
 *   - pending: 评分提交中的乐观过渡
 *
 * 提交流程:
 *   1. 用户点 Rating 按钮 -> formData 包装 cardId + rating(1..4)
 *   2. useTransition 的 startTransition 包住 answerCardAction
 *   3. 成功 -> index++(下一张);revealed 重置
 *   4. 失败 -> 错误信息显示在卡顶,revealed 保持
 *
 * "Again" (rating=1) 特殊处理:
 *   - 服务器仍然记录答案(FSRS 状态照常更新)
 *   - 客户端把当前卡 push 到队尾(redoCount++),index 推进一步
 *   - 这样这张卡在本次会话末尾会再出现一次
 *
 * 撤回 (undo):
 *   - 每次成功评分/撤回都设置 lastAnsweredCardId
 *   - 撤回按钮点击 -> undoCardAction(服务端真实还原 FSRS) + index--
 *   - 撤回仅作用于最近一次;若该次评分是 "Again" 重新入队,撤回
 *     不移除队列末尾的那张同名卡片(最佳努力 — MVP 范围)
 */
export function StudySession({
  deckId,
  mode,
  initialQueue,
  favoritesOnly = false,
  totalFavorites = 0,
}: StudySessionProps) {
  // Phase 8 (re-exec): the queue is now STATEFUL. A card whose answer
  // didn't graduate / reach the threshold (server sets
  // `requeueInSession`) is re-inserted at a random later slot so the
  // user re-tests it before the session ends — see handleRate.
  const [queue, setQueue] = useState<StudyCard[]>(initialQueue);
  const [index, setIndex] = useState(0);
  // Cards that have completed (graduated, or hit the re-queue cap) — the
  // basis for the "mastered N / total" progress, distinct from raw
  // rating count (which now grows with re-tests).
  const [finishedCards, setFinishedCards] = useState<Set<string>>(
    () => new Set()
  );
  // Per-card re-queue counter so a stubborn card can't loop forever.
  const [requeueCounts, setRequeueCounts] = useState<Record<string, number>>(
    {}
  );
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState(0);
  // Phase 08-02: per-card FSRS 6 progress mirror. Initialized
  // from the queue item, updated in place after each
  // answerCardAction returns. Keyed by cardId so the bar follows
  // the card across queue advances (a card returned to the queue
  // after Again would have an updated value).
  const [progressByCard, setProgressByCard] = useState<Record<string, number>>(
    () => Object.fromEntries(queue.map((c) => [c.cardId, c.progress]))
  );
  // Monotonic counter bumped on every advance. Passed down to
  // CardBody so it wipes its internal `judgment` + `multiPicks`
  // state on each new card — even though the same cardId is
  // (theoretically) possible if the queue is mutated, the bump
  // makes the wipe a safety belt for any future re-show path.
  const [revealKey, setRevealKey] = useState(0);
  const [lastAnsweredCardId, setLastAnsweredCardId] = useState<string | null>(
    null
  );
  const [undoError, setUndoError] = useState<string | null>(null);
  const [judgment, setJudgment] = useState<{
    correct: boolean;
    userPicks: number[];
  } | null>(null);
  const [isPending, startTransition] = useTransition();
  // Phase 7-03: client-side cache of per-card favorite state. The
  // initial seed is the union of cards in this session; the toggle
  // action (07-01) returns the new isFavorite value which we mirror
  // into this map so the heart renders the canonical truth on next
  // paint. The optimistic overlay (below) drives the in-flight flip.
  const [favorites, setFavorites] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(initialQueue.map((c) => [c.cardId, c.isFavorite]))
  );
  // Phase 7-03: per-session verdict counters. Both increment in
  // handleJudged (one or the other per card, never both) and feed
  // the completion state via buildSessionStats.
  const [correctCount, setCorrectCount] = useState(0);
  const [wrongCount, setWrongCount] = useState(0);
  // Phase 7-03: optimistic favorite state. The reducer flips the
  // single cardId passed in addOptimisticFavorite(cardId) — it's
  // already true-ish inside the transition. Once the server action
  // resolves, setFavorites writes the canonical value and React
  // collapses the optimistic overlay back to the source of truth.
  const [optimisticFavorites, addOptimisticFavorite] = useOptimistic<
    Record<string, boolean>,
    string
  >(favorites, (state, cardId) => ({ ...state, [cardId]: !state[cardId] }));

  // The unique-card count (constant for the session). The "X / Y"
  // progress is shown against this so the queue never inflates
  // — picking "Again" no longer re-shows the same card in this
  // session; FSRS reschedules the card for the user's next session.
  const totalCards = initialQueue.length;

  const current = queue[index];
  // Phase 08-02: current card's progress (0-1). Read from the
  // per-card mirror so it reflects the post-answer update from
  // handleRate. Falls back to 0 for safety when the index is
  // out of range (defensive — should not happen in practice).
  const currentProgress =
    current ? progressByCard[current.cardId] ?? current.progress : 0;
  // Progress is now mastery-based: how many of the session's UNIQUE cards
  // have completed (graduated / hit the re-queue cap). Raw rating count
  // (`reviewed`) over-counts because a re-tested card is rated more than
  // once, so it can't drive the bar.
  const mastered = finishedCards.size;
  const remaining = totalCards - mastered;
  const progress = useMemo(() => {
    return totalCards === 0 ? 0 : Math.round((mastered / totalCards) * 100);
  }, [mastered, totalCards]);

  // All hooks must be called before any early return — define the
  // judgment + undo handlers here so they're stable across renders.
  const handleJudged = useCallback(
    (result: { correct: boolean; cardId: string; userPicks: number[] }) => {
      // The CardBody's onJudged already commits the verdict to the
      // local state — we mirror it here so the rating bar can adapt
      // (only "Again" when wrong; all 4 when correct).
      setJudgment({ correct: result.correct, userPicks: result.userPicks });
      // Phase 7-03: per-session verdict counters. One or the other
      // bumps per card — they partition the reviewed count exactly.
      if (result.correct) {
        setCorrectCount((n) => n + 1);
      } else {
        setWrongCount((n) => n + 1);
      }
      // Auto-reveal once the user has self-judged so the rating
      // bar appears. The CardBody will show the verdict inline.
      setRevealed(true);
    },
    []
  );

  const handleUndo = useCallback(() => {
    if (!lastAnsweredCardId || isPending) return;
    setUndoError(null);
    const fd = new FormData();
    fd.set("cardId", lastAnsweredCardId);
    startTransition(async () => {
      const result = await undoCardAction(null, fd);
      if (result?.error) {
        setUndoError(result.error);
        return;
      }
      if (result?.restored === false) {
        // No history to undo (e.g. very first review already cleared).
        setUndoError(
          result.reason === "corrupt-history"
            ? "日志已损坏,无法撤回"
            : "已无可撤回的记录"
        );
        return;
      }
      // Rewind: decrement index, re-hide the answer panel, decrement
      // the reviewed counter. The rewound card will re-appear at the
      // queue position [index-1] (whatever was there before).
      setLastAnsweredCardId(null);
      setIndex((i) => Math.max(0, i - 1));
      setRevealed(false);
      setReviewed((n) => Math.max(0, n - 1));
      // If the rewound card was an "Again" re-queue, the queue still
      // carries it at the tail — best effort, MVP.
    });
  }, [lastAnsweredCardId, isPending]);

  // Phase 7-03: optimistic favorite toggle. Flips the heart in
  // the same tick as the click via useOptimistic's reducer, then
  // waits for the server action to confirm. If the action errors,
  // we surface the message in the existing `error` slot (the card
  // top bar) — React 19 will revert the optimistic flip on its
  // own when setFavorites writes the canonical value.
  const handleToggleFavorite = useCallback(() => {
    if (!current || isPending) return;
    setError(null);
    const fd = new FormData();
    fd.set("cardId", current.cardId);
    startTransition(async () => {
      addOptimisticFavorite(current.cardId);
      const result = await toggleFavoriteStudyAction(null, fd);
      if (result?.error) {
        setError(result.error);
        return;
      }
      if (typeof result?.isFavorite === "boolean") {
        setFavorites((prev) => ({
          ...prev,
          [current.cardId]: result.isFavorite!,
        }));
      }
    });
  }, [current, isPending, addOptimisticFavorite]);

  // === 完成状态:队列跑完 ===
  if (queue.length === 0 || index >= queue.length) {
    const stats = buildSessionStats({ reviewed, correctCount, wrongCount });
    const restartHref = favoritesOnly
      ? `/decks/${deckId}/study?favorites=1`
      : `/decks/${deckId}/study`;
    return (
      <Card className="glass-card">
        <CardContent className="space-y-4 px-6 py-16 text-center">
          <p className="eyebrow text-brand">完成</p>
          <ZhTitle zh="今日学习完成" en="SESSION DONE" size="h2" />
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{stats.totalLine}</p>
            <p className="font-mono text-xs text-muted-foreground">
              {stats.statsLine}
            </p>
          </div>
          <div className="flex justify-center gap-2 pt-2">
            <Button asChild variant="outline">
              <a href={`/decks/${deckId}`}>返回牌组</a>
            </Button>
            <Button asChild>
              <a href={restartHref}>再来一组</a>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  function handleReveal() {
    setRevealed(true);
  }


  function handleRate(rating: number) {
    if (!current || !revealed) return;
    setError(null);
    // Reset any previous judgment for the next card.
    setJudgment(null);

    // Capture pre-advance snapshot for rollback and correct requeue
    // positioning (the queue mutates during the transition, so we must
    // freeze these values before any state update).
    const capturedCardId = current.cardId;
    const capturedIndex = index;
    const capturedQueueLen = queue.length;

    const fd = new FormData();
    fd.set("cardId", capturedCardId);
    fd.set("rating", String(rating));

    // Optimistic advance runs SYNCHRONOUSLY here (NOT inside
    // startTransition). The next card paints in the same tick AND its
    // 显示答案 / rating controls are immediately interactive. Previously
    // these updates lived inside the same transition as the server call,
    // so the single shared `isPending` stayed true through this card's
    // await -- which disabled the NEXT card's buttons until the previous
    // server write returned (在 dev 模式 JIT 重编译下长达 1-3s). That was
    // the "答案显示要多点好几次 / 自评卡顿" stutter. The `!revealed`
    // guard above flips off the moment we setRevealed(false), closing the
    // same-card double-submit window.
    setRevealed(false);
    setRevealKey((k) => k + 1);
    setLastAnsweredCardId(capturedCardId);
    setReviewed((n) => n + 1);
    setIndex((i) => i + 1);

    startTransition(async () => {
      // The server write runs in the background. We deliberately do NOT
      // let its isPending gate the next card (see the optimistic block
      // above).
      const result = await answerCardAction(null, fd);

      if (!result || result.error) {
        // Rollback the optimistic advance for this card. Undo every
        // counter the advance bumped (reviewed) and only clear the undo
        // pointer if it still refers to THIS card (a later successful
        // rating may have moved it). Rewind index + re-reveal so the
        // failed card comes back for another try.
        setError(result?.error ?? "评分失败,请重试");
        setIndex((i) => Math.max(0, i - 1));
        setRevealed(true);
        setReviewed((n) => Math.max(0, n - 1));
        setLastAnsweredCardId((id) => (id === capturedCardId ? null : id));
        return;
      }

      // Phase 08-02: mirror the freshly-written Card.progress
      // (returned in newState) so the top-of-card hairline bar
      // reflects the post-answer value without a round-trip.
      const newProgress = result.newState?.progress;
      if (typeof newProgress === "number") {
        setProgressByCard((prev) => ({
          ...prev,
          [capturedCardId]: newProgress,
        }));
      }

      // Phase 8 (re-exec): the scheduling strategy tells us (via
      // `requeueInSession`) whether this answer reached the first-session
      // threshold. Use the PRE-ADVANCE snapshot for the requeue splice
      // position so the card lands at the correct later slot even though
      // index has already incremented (Pitfall 2).
      const requeueCount = requeueCounts[capturedCardId] ?? 0;
      const willRequeue =
        result.requeueInSession === true &&
        requeueCount < REQUEUE_MAX_PER_CARD;

      if (willRequeue) {
        setRequeueCounts((m) => ({
          ...m,
          [capturedCardId]: requeueCount + 1,
        }));
        setQueue((q) => {
          const at = requeuePosition(capturedIndex, capturedQueueLen, Math.random);
          const next = q.slice();
          // Re-insert the card from the pre-advance snapshot position.
          // q[capturedIndex] is still the same card object (queue items
          // are stable references; only index advanced, not the array).
          next.splice(at, 0, q[capturedIndex]);
          return next;
        });
      } else {
        setFinishedCards((s) => {
          const next = new Set(s);
          next.add(capturedCardId);
          return next;
        });
      }
      // NOTE: setIndex / setRevealed / setRevealKey are NOT called here.
      // They already ran in the optimistic advance above -- a second call
      // would double-advance or re-hide a card that was already hidden.
    });
  }

  return (
    <div className="space-y-4">
      {/*
        Cram 模式横幅:复习全部卡片,绕过 FSRS 调度。
        评分仍写入 ReviewLog(后续 Phase 9 统计可基于此区分)。
      */}
      {mode === "cram" ? (
        <div className="glass-card flex items-center justify-between gap-3 rounded-lg border-dashed px-4 py-2.5 font-mono text-xs">
          <div className="flex items-center gap-2">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand" />
            <span className="uppercase tracking-wider text-brand">
              CRAM 模式
            </span>
            <span className="text-muted-foreground">
              · 复习全部卡片,不影响调度
            </span>
          </div>
          <Link
            href={`/decks/${deckId}/study`}
            className="text-muted-foreground hover:text-foreground"
          >
            退出
          </Link>
        </div>
      ) : null}

      {/* === 进度条 + 剩余计数 + 工具栏 (Heart / Filter / 撤回) === */}
      <div className="space-y-2">
        <div className="flex items-center justify-between font-mono text-xs text-muted-foreground">
          <span>
            {mastered} / {totalCards}
            {favoritesOnly ? (
              <span className="ml-2 text-brand">
                FAVORITES · {totalFavorites}
              </span>
            ) : null}
          </span>
          <div className="flex items-center gap-1.5">
            <span>
              剩余 {remaining}
              {totalFavorites > 0 ? (
                <span className="ml-1 text-muted-foreground/60">
                  · 收藏 {totalFavorites}
                </span>
              ) : null}
            </span>
            {/* Heart: optimistic favorite toggle (07-01 + 07-03) */}
            <button
              type="button"
              onClick={handleToggleFavorite}
              disabled={isPending}
              aria-label={
                optimisticFavorites[current.cardId]
                  ? "取消收藏"
                  : "收藏"
              }
              aria-pressed={optimisticFavorites[current.cardId] ?? false}
              data-pressed={optimisticFavorites[current.cardId] ?? false}
              className="inline-flex h-11 md:h-10 items-center justify-center gap-1 rounded-md border border-border/40 bg-card/30 px-3 text-muted-foreground transition-colors hover:border-brand/40 hover:text-brand disabled:opacity-50 data-[pressed=true]:border-brand data-[pressed=true]:text-brand data-[pressed=true]:bg-brand/10"
            >
              <Heart
                className="h-4 w-4"
                aria-hidden
                fill={
                  optimisticFavorites[current.cardId] ? "currentColor" : "none"
                }
              />
              <span className="hidden sm:inline">收藏</span>
            </button>
            {/* Filter: Link toggle between /study and /study?favorites=1 */}
            <Link
              href={
                favoritesOnly
                  ? `/decks/${deckId}/study`
                  : `/decks/${deckId}/study?favorites=1`
              }
              aria-label={favoritesOnly ? "退出收藏模式" : "仅复习收藏"}
              aria-pressed={favoritesOnly}
              data-pressed={favoritesOnly}
              className="inline-flex h-11 md:h-10 items-center justify-center gap-1 rounded-md border border-border/40 bg-card/30 px-3 text-muted-foreground transition-colors hover:border-brand/40 hover:text-brand data-[pressed=true]:border-brand data-[pressed=true]:text-brand data-[pressed=true]:bg-brand/10"
            >
              <Filter className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">仅收藏</span>
            </Link>
            {/* 撤回: 升级到 44px 触屏目标 (07-03) */}
            {lastAnsweredCardId ? (
              <button
                type="button"
                onClick={handleUndo}
                disabled={isPending}
                aria-label="撤回最近一次评分"
                className="inline-flex h-11 md:h-10 items-center justify-center gap-1 rounded-md border border-border/40 bg-card/30 px-3 text-muted-foreground transition-colors hover:border-brand/40 hover:text-brand disabled:opacity-50"
              >
                <Undo2 className="h-4 w-4" aria-hidden />
                <span className="hidden sm:inline">撤回</span>
              </button>
            ) : null}
          </div>
        </div>
        <div
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-1.5 w-full overflow-hidden rounded-full bg-card"
        >
          <div
            className="h-full bg-brand transition-[width] duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        {undoError ? (
          <p
            className="text-right font-mono text-[10px] text-destructive"
            role="alert"
            aria-live="polite"
          >
            {undoError}
          </p>
        ) : null}
      </div>

      {/* === 卡片 === 复用 cards/ 下的 CardBody,支持全部 5 种题型 */}
      <Card className="glass-card">
        <CardContent className="space-y-4 px-6 pb-6 pt-6">
          {/*
            Phase 08-02: per-card FSRS 6 progress hairline. 1px
            tall, brand-colored fill, no background track (avoids
            the "scoring-bar" anti-pattern). The user sees "this
            is how much of this card I've learned" without the
            bar looking like a filled quota.
          */}
          <div
            className="h-px w-full bg-border"
            role="progressbar"
            aria-valuenow={Math.round(currentProgress * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`本卡学习进度 ${Math.round(currentProgress * 100)}%`}
          >
            <div
              className="h-px bg-brand transition-[width] duration-300 ease-out"
              style={{ width: `${currentProgress * 100}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
            <span>FSRS 6 进度</span>
            <span
              className="tabular-nums"
              data-pct={
                currentProgress < 0.25
                  ? "low"
                  : currentProgress < 0.75
                  ? "mid"
                    : "high"
              }
            >
              {Math.round(currentProgress * 100)}%
            </span>
          </div>

          {error ? (
            <div className="flex justify-end">
              <span className="font-mono text-xs text-destructive">
                {error}
              </span>
            </div>
          ) : null}

          {/*
            (No "重做"提示 —— Again 不会立即重出,FSRS 在服务器
            端调度该卡的下次出现时间。)
          */}

          {/*
            CardBody 接管:题目 + 各题型答案渲染。
            - qa:front + back 揭示
            - choice:选项列表(揭示后高亮正确答案)
            - multi_choice:同上(多选)
            - judge:正确/错误按钮(揭示后高亮)
            - fill:`{{cN::hint}}` 挖空语法,揭示后原位显示答案

            interactive=true 让选项变成可点击按钮,用户自评后
            CardBody 内部锁定 + 显示 verdict,通过 onJudged 回传。
          */}
          <CardBody
            type={current.type}
            frontContent={current.frontContent}
            backContent={current.backContent}
            typeData={current.typeData}
            showAnswer={revealed}
            cardId={current.cardId}
            interactive
            onJudged={handleJudged}
            revealKey={revealKey}
          />

          {/* 显示答案按钮(未揭示时) —— 只在用户尚未自评时出现 */}
          {!revealed ? (
            <div className="flex justify-center pt-2">
              <Button
                type="button"
                size="lg"
                onClick={handleReveal}
                className="w-full sm:w-auto active:scale-[0.97] transition-transform duration-[150ms]"
              >
                显示答案
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* === Rating Bar(揭示后显示) === */}
      {revealed ? (
        <div className="space-y-2">
          <p className="eyebrow text-center text-muted-foreground">
            {judgment
              ? judgment.correct
                ? "答对了 · 自评"
                : "答错了 · 仅可重来"
              : "自评"}
          </p>
          <div
            className={cn(
              "grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3",
              judgment && !judgment.correct ? "sm:grid-cols-2" : ""
            )}
          >
            <RatingButton
              rating={1}
              label="重来"
              shortKey="1"
              tone="destructive"
              onClick={() => handleRate(1)}
            />
            {judgment && !judgment.correct ? null : (
              <>
                <RatingButton
                  rating={2}
                  label="困难"
                  shortKey="2"
                  tone="warning"
                  onClick={() => handleRate(2)}
                />
                <RatingButton
                  rating={3}
                  label="良好"
                  shortKey="3"
                  tone="brand"
                  onClick={() => handleRate(3)}
                />
                <RatingButton
                  rating={4}
                  label="简单"
                  shortKey="4"
                  tone="muted"
                  onClick={() => handleRate(4)}
                />
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Phase 7-03: pure helper that turns a session's verdict counters
 * into the two-line completion card copy. Exported (alongside
 * StudyCard / StudySession) so the test file can import the helper
 * directly without mounting React or jsdom. No side effects, no
 * React dependency, no `useState` / `useOptimistic` — just a
 * template-string joiner.
 */
export function buildSessionStats(input: {
  reviewed: number;
  correctCount: number;
  wrongCount: number;
}): { totalLine: string; statsLine: string } {
  return {
    totalLine: `本次共复习 ${input.reviewed} 张卡片`,
    statsLine: `答对 ${input.correctCount} · 答错 ${input.wrongCount}`,
  };
}

/**
 * 4 按钮 Rating Bar 的子组件。
 * - 桌面/平板:`h-11` (44px) 触屏目标
 * - 移动:`h-12` (48px) 触屏目标
 * - 颜色:tone 控制边框/文字色调,符合品牌冷暖色板
 */
interface RatingButtonProps {
  rating: number;
  label: string;
  shortKey: string;
  tone: "destructive" | "warning" | "brand" | "muted";
  /**
   * Optional. The rating buttons are no longer gated on the session's
   * shared `isPending` (that gating disabled the NEXT card while the
   * PREVIOUS card's answer was still in flight -- the post-optimistic-
   * advance stutter). Each rating only renders for the current revealed
   * card, and `handleRate`'s `!revealed` guard prevents same-card
   * double-submit, so a disabled state is unnecessary here.
   */
  disabled?: boolean;
  onClick: () => void;
}

function RatingButton({
  label,
  shortKey,
  tone,
  disabled,
  onClick,
}: RatingButtonProps) {
  const toneClasses: Record<RatingButtonProps["tone"], string> = {
    destructive:
      "border-destructive/40 text-destructive hover:bg-destructive/10",
    warning: "border-warning/40 text-warning hover:bg-warning/10",
    brand: "border-brand/40 text-brand hover:bg-brand/10",
    muted: "border-border text-muted-foreground hover:bg-card",
  };

  return (
    <Button
      type="button"
      variant="outline"
      disabled={disabled}
      onClick={onClick}
      className={`h-12 w-full flex-col gap-0.5 font-medium active:scale-[0.97] transition-transform duration-[150ms] ${toneClasses[tone]}`}
    >
      <span>{label}</span>
      <span className="font-mono text-[10px] opacity-60">{shortKey}</span>
    </Button>
  );
}

// cn is needed above for the grid width switch on wrong verdict.
// (imported at the top with the other third-party imports)

