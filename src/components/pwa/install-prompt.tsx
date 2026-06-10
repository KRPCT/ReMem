"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [showIOSHint, setShowIOSHint] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [installError, setInstallError] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem("pwa-install-dismissed")) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);

    const isIOS = /iP(ad|hone|od)/.test(navigator.userAgent);
    const isStandalone =
      (window.navigator as { standalone?: boolean }).standalone === true;
    if (isIOS && !isStandalone) setShowIOSHint(true);

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (dismissed || (!deferredPrompt && !showIOSHint)) return null;

  async function handleInstall() {
    if (!deferredPrompt) return;
    setInstallError(false);
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === "dismissed") {
      setInstallError(true);
    }
    setDeferredPrompt(null);
  }

  function handleDismiss() {
    localStorage.setItem("pwa-install-dismissed", "1");
    setDismissed(true);
  }

  return (
    <div
      className="fixed bottom-0 inset-x-0 z-40 glass-card rounded-none border-t border-border/40 flex items-center gap-s px-l py-m"
      style={{
        paddingBottom:
          "calc(var(--spacing-m) + env(safe-area-inset-bottom, 0px) + 56px)",
      }}
    >
      <div className="flex-1 space-y-xs">
        <p className="text-sm font-semibold">安装 ReMem 到主屏幕</p>
        <p className="text-[11px] text-muted-foreground">
          {showIOSHint
            ? "点击下方分享按钮，选择「添加到主屏幕」"
            : installError
            ? "安装失败，请稍后重试"
            : "离线学习，添加到主屏幕获得更好体验"}
        </p>
      </div>
      {!showIOSHint && (
        <Button size="sm" onClick={handleInstall}>
          安装应用
        </Button>
      )}
      <Button
        size="icon"
        variant="ghost"
        className="h-11 w-11"
        aria-label="关闭安装提示"
        onClick={handleDismiss}
      >
        ×
      </Button>
    </div>
  );
}
