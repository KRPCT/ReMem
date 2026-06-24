"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, Copy, Link2, Link2Off } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  generateShareLinkAction,
  disableShareLinkAction,
} from "../actions";

/**
 * Deck-share controls (pro settings block). Generates a stable
 * token-link that anyone can open to preview the deck and deep-clone it
 * into their own account (one-time snapshot — no FSRS state copied).
 *
 * The full URL is composed client-side from `window.location.origin`
 * after mount (so it's correct on whatever host the app is served from —
 * the China VPS :8000, the Vercel demo, or localhost) and is never
 * rendered during SSR to avoid a hydration mismatch.
 */
export function ShareDeckForm({
  deckId,
  initialToken,
}: {
  deckId: string;
  initialToken: string | null;
}) {
  const [token, setToken] = useState<string | null>(initialToken);
  const [origin, setOrigin] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const shareUrl = token ? `${origin}/share/${token}` : "";

  const handleGenerate = () => {
    setError(null);
    const fd = new FormData();
    fd.set("id", deckId);
    startTransition(async () => {
      const result = await generateShareLinkAction(null, fd);
      if (result?.error) {
        setError(result.error);
        return;
      }
      if (result?.shareToken) setToken(result.shareToken);
    });
  };

  const handleDisable = () => {
    setError(null);
    const fd = new FormData();
    fd.set("id", deckId);
    startTransition(async () => {
      const result = await disableShareLinkAction(null, fd);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setToken(null);
      setCopied(false);
    });
  };

  const handleCopy = () => {
    if (!shareUrl) return;
    navigator.clipboard
      .writeText(shareUrl)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => setError("复制失败，请手动选择链接"));
  };

  if (!token) {
    return (
      <div className="space-y-3">
        <Button type="button" onClick={handleGenerate} disabled={pending}>
          <Link2 className="h-4 w-4" aria-hidden />
          <span className="ml-1">{pending ? "生成中..." : "生成分享链接"}</span>
        </Button>
        {error ? (
          <p
            className="text-sm"
            role="alert"
            style={{ color: "hsl(var(--destructive))" }}
          >
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          type="text"
          readOnly
          value={shareUrl}
          onFocus={(e) => e.currentTarget.select()}
          aria-label="分享链接"
          className="glass-input flex-1 font-mono text-xs"
        />
        <Button
          type="button"
          variant="outline"
          onClick={handleCopy}
          disabled={!shareUrl}
        >
          {copied ? (
            <>
              <Check className="h-4 w-4" aria-hidden />
              <span className="ml-1">已复制</span>
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" aria-hidden />
              <span className="ml-1">复制</span>
            </>
          )}
        </Button>
      </div>
      <p className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
        任何拿到此链接的人都可以预览并把这套牌组复制到自己的账户（一次性快照，
        不含你的复习记录与进度）。停用后链接立即失效，已复制的副本不受影响。
      </p>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleDisable}
          disabled={pending}
          style={{ color: "hsl(var(--destructive))" }}
        >
          <Link2Off className="h-4 w-4" aria-hidden />
          <span className="ml-1">{pending ? "处理中..." : "停用链接"}</span>
        </Button>
      </div>
      {error ? (
        <p
          className="text-sm"
          role="alert"
          style={{ color: "hsl(var(--destructive))" }}
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
