"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { updateUserSettingsAction } from "./actions";
import type { UserPrefs } from "@/lib/user-settings";

const PREFS: Array<{ key: keyof UserPrefs; title: string; desc: string }> = [
  {
    key: "showNextReviewTime",
    title: "学习后显示下次复习时间",
    desc: "每次评分后，提示这张卡下次复习的间隔（如「4 天后」）。",
  },
  {
    key: "browseDefaultShowAnswer",
    title: "浏览时默认显示答案",
    desc: "在牌组画廊点开卡片预览时默认直接展开答案。学习模式始终先隐藏答案。",
  },
  {
    key: "autoRevealCloze",
    title: "自动揭示填空答案",
    desc: "开启时，显示答案会一并填入所有挖空；关闭后需逐个点击挖空才显示，更适合主动回忆。",
  },
];

/**
 * Account-level UX preference toggles (B2). Saves on every flip
 * (optimistic) — each toggle posts the full set so a partial write can
 * never desync the row. On a server error the flip is reverted and the
 * message surfaces inline. Mirrors the immediate-apply feel of the
 * sibling TypeAccentForm without its localStorage layer (this is
 * server-persisted, account-level).
 */
export function UserPrefsForm({ initial }: { initial: UserPrefs }) {
  const [prefs, setPrefs] = useState<UserPrefs>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const toggle = (key: keyof UserPrefs) => {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next); // optimistic
    setError(null);
    const fd = new FormData();
    fd.set("showNextReviewTime", String(next.showNextReviewTime));
    fd.set("browseDefaultShowAnswer", String(next.browseDefaultShowAnswer));
    fd.set("autoRevealCloze", String(next.autoRevealCloze));
    startTransition(async () => {
      const result = await updateUserSettingsAction(null, fd);
      if (result?.error) {
        setError(result.error);
        setPrefs((p) => ({ ...p, [key]: !p[key] })); // revert
      }
    });
  };

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle>学习与浏览偏好</CardTitle>
        <p className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
          账户级设置，保存在服务器，所有设备登录后一致生效。
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {PREFS.map((p) => {
          const on = prefs[p.key];
          return (
            <div
              key={p.key}
              className="flex items-start justify-between gap-4 rounded-xl border p-4"
              style={{ borderColor: "hsl(var(--border))" }}
            >
              <div className="space-y-0.5">
                <p className="text-sm font-medium">{p.title}</p>
                <p
                  className="text-xs"
                  style={{ color: "hsl(var(--muted-foreground))" }}
                >
                  {p.desc}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-label={p.title}
                disabled={pending}
                onClick={() => toggle(p.key)}
                className={cn(
                  "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors disabled:opacity-50",
                  on ? "border-brand bg-brand" : "bg-card"
                )}
                style={on ? undefined : { borderColor: "hsl(var(--border))" }}
              >
                <span
                  className={cn(
                    "inline-block h-4 w-4 rounded-full shadow transition-transform",
                    on ? "translate-x-5" : "translate-x-1"
                  )}
                  style={{
                    backgroundColor: on
                      ? "hsl(var(--color-brand-foreground-1))"
                      : "hsl(var(--muted-foreground))",
                  }}
                />
              </button>
            </div>
          );
        })}
        {error ? (
          <p
            className="text-xs"
            role="alert"
            aria-live="polite"
            style={{ color: "hsl(var(--destructive))" }}
          >
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
