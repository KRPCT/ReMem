import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "var(--font-inter)",
          "HarmonyOS Sans SC",
          "PingFang SC",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "system-ui",
          "sans-serif",
        ],
        // Note: `display` removed in v2 refactor — single voice. H1
        // styling now flows through <ZhTitle> which sets the
        // LXGW WenKai family via inline style on the heading.
        mono: [
          "var(--font-mono)",
          "Cascadia Code",
          "Fira Code",
          "Consolas",
          "Menlo",
          "monospace",
        ],
      },
      // 4 breakpoint responsive system (sketch 001 v2)
      // Tailwind v3 defaults (sm 640 / md 768 / lg 1024 / xl 1280) already match
      // the v2 spec. Listed here for documentation.
      screens: {
        sm: "640px",
        md: "768px",
        lg: "1024px",
        xl: "1280px",
        "2xl": "1536px",
      },
      maxWidth: {
        content: "1024px",
        reading: "720px",
        form: "480px",
        auth: "400px",
      },
      // Maps the design-system spacing scale to Tailwind utilities.
      // Affects gap-*, p-*, m-*, w-*, h-*, min-h-*, etc. (Tailwind v3
      // spacing extension applies to ALL spacing utilities).
      // Tokens live in src/app/globals.css as --spacing-* CSS vars.
      spacing: {
        xxs: "var(--spacing-xxs)",
        xs: "var(--spacing-xs)",
        s: "var(--spacing-s)",
        snudge: "var(--spacing-snudge)",
        m: "var(--spacing-m)",
        l: "var(--spacing-l)",
        xl: "var(--spacing-xl)",
        xxl: "var(--spacing-xxl)",
        xxxl: "var(--spacing-xxxl)",
        hero: "var(--spacing-hero)",
        mega: "var(--spacing-mega)",
      },
      minHeight: {
        topnav: "56px",
        touch: "44px",
        toolbar: "40px",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [tailwindcssAnimate],
};

export default config;
