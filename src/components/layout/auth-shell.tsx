import { ReactNode } from "react";
import Link from "next/link";
import { ZhTitle } from "@/components/typography/zh-title";
import { Brain } from "lucide-react";

/**
 * <AuthShell> — 单一统一玻璃面板，包装 /login 与 /register。
 *
 * 设计要点（v2 refactor）：
 * - 整个 dock 是**一个** `glass-card`，不再嵌套 Card
 * - 顶部 1px 品牌色渐变 accent + brain icon + mono 副标（与
 *   主页 hero 的 "开源闪卡 · 间隔重复" eyebrow 风格呼应）
 * - 标题 / 表单 / 底部链接用**渐变分隔线**隔开，不用实线 border
 * - 全部内容居中对齐，垂直水平居中
 *
 * `Adding a new auth surface (forgot-password, magic-link, etc.)
 * must compose this shell, NOT replicate it. See §3.2 in
 * docs/DESIGN_SYSTEM.md.`
 */
export interface AuthShellProps {
  /** 中文主标题（如 "登录 ReMem"）。LXGW WenKai 渲染。 */
  titleZh: string;
  /** 英文 mono 副标（如 "SIGN IN"）。JetBrains Mono 大写。 */
  titleEn: string;
  /** 标题下方的灰色说明文字。 */
  subtitle?: string;
  /** 实际表单内容（LoginForm / RegisterForm / 未来 ForgotPasswordForm）。 */
  children: ReactNode;
  /** 底部链接的引导语，如 "还没有账号？"。 */
  footerPrompt: string;
  /** 底部链接的文字，如 "立即注册"。 */
  footerLinkText: string;
  /** 底部链接的目标路由。 */
  footerLinkHref: string;
}

export function AuthShell({
  titleZh,
  titleEn,
  subtitle,
  children,
  footerPrompt,
  footerLinkText,
  footerLinkHref,
}: AuthShellProps) {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-56px)] max-w-auth flex-col items-center justify-center px-4 py-10 sm:py-14 md:px-6">
      <div className="glass-card relative w-full overflow-hidden rounded-2xl shadow-2xl">
        {/* Brand-color accent strip at the very top — gives the
         * glass panel a "lit edge" feel like iOS Dynamic Island. */}
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand to-transparent opacity-70"
        />

        <div className="space-y-6 p-6 sm:p-8">
          {/* Brand mark row — anchors the dock in the visual identity */}
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Brain className="h-4 w-4 text-brand" aria-hidden />
            <span className="font-mono text-[10.5px] uppercase tracking-[0.18em]">
              记忆 · MEMORY
            </span>
          </div>

          {/* Title block */}
          <div className="flex flex-col items-center gap-2 text-center">
            <ZhTitle zh={titleZh} en={titleEn} size="h2" align="center" />
            {subtitle && (
              <p className="text-sm text-muted-foreground">{subtitle}</p>
            )}
          </div>

          {/* Gradient divider — replaces hard border for cohesion */}
          <div
            aria-hidden
            className="h-px bg-gradient-to-r from-transparent via-border to-transparent"
          />

          {/* Form slot */}
          <div>{children}</div>

          {/* Gradient divider */}
          <div
            aria-hidden
            className="h-px bg-gradient-to-r from-transparent via-border to-transparent"
          />

          {/* Footer link */}
          <p className="text-center text-sm text-muted-foreground">
            {footerPrompt}{" "}
            <Link
              href={footerLinkHref}
              className="font-semibold text-brand transition-colors hover:underline"
            >
              {footerLinkText}
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
