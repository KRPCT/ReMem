"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

type Theme = "dark" | "light";

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem("remem-theme", theme);
  } catch {}
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    let initial: Theme = "dark";
    try {
      const saved = localStorage.getItem("remem-theme") as Theme | null;
      if (saved === "light" || saved === "dark") initial = saved;
      else if (window.matchMedia("(prefers-color-scheme: light)").matches) {
        initial = "light";
      }
    } catch {}
    applyTheme(initial);
    setTheme(initial);
  }, []);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    applyTheme(next);
    setTheme(next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={
        mounted ? `切换到${theme === "dark" ? "浅色" : "深色"}模式` : "切换主题"
      }
      className="tap-target relative inline-flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      {/* Render the icon for the *next* state (i.e. "click to switch to").
       * Stable initial = Sun to avoid hydration mismatch (we default to
       * dark, so show the sun = "click to go light"). */}
      <Sun
        className="h-4 w-4 transition-all dark:scale-0 dark:-rotate-90"
        suppressHydrationWarning
        aria-hidden
      />
      <Moon
        className="absolute h-4 w-4 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0"
        suppressHydrationWarning
        aria-hidden
      />
      <span className="sr-only">切换主题</span>
    </button>
  );
}
