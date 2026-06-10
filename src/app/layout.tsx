import "./globals.css";
import "katex/dist/katex.min.css";
import "highlight.js/styles/github-dark.css";
import type { Metadata, Viewport } from "next";
import { Inter, LXGW_WenKai_TC, JetBrains_Mono } from "next/font/google";
import { SwRegister } from "@/components/pwa/sw-register";
import { SiteHeader } from "@/components/layout/site-header";
import { BottomNav } from "@/components/layout/bottom-nav";
import { InstallPrompt } from "@/components/pwa/install-prompt";

// 正文：Inter（拉丁字母）+ HarmonyOS Sans SC（中文）
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

// 中文艺术字：LXGW WenKai TC（霞鹜文楷）+ 衬线回退
// Note: LXGW WenKai TC is a CJK font — Google Fonts only lists the
// Latin subset for subset-based preloading, so we pass ["latin"] to
// satisfy next/font's preload check. The full CJK glyphs are in the
// woff2 file regardless.
const wenkai = LXGW_WenKai_TC({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-wenkai",
  display: "swap",
});

// 英文小字：JetBrains Mono
const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ReMem · Markdown 闪卡",
  description: "基于 FSRS 改进的间隔重复算法的 Markdown 闪卡学习应用",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#08090C",
};

// Inline no-flash theme bootstrap. Reads `remem-theme` from
// localStorage and sets data-theme on <html> before any CSS paints, so
// users on light mode never see a frame of dark mode (and vice versa).
// Falls back to system pref via prefers-color-scheme, defaulting to
// dark to match the original page intent.
const NO_FLASH_THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('remem-theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';}document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme='dark';}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="zh-CN"
      className={`${inter.variable} ${wenkai.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{ __html: NO_FLASH_THEME_SCRIPT }}
        />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased pb-mega md:pb-0">
        <SwRegister />
        <SiteHeader />
        {children}
        <BottomNav />
        <InstallPrompt />
      </body>
    </html>
  );
}
