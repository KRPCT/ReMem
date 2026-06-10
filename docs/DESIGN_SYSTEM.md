# ReMem-Reborn Design System v2

> **The source of truth for every page, component, and snippet in
> the app.** Last updated 2026-06-06 alongside the v2 Fluent 2 +
> Linux.do + Chinese-first typography refactor. Single voice
> (Community) — see §5.

## 1. Stack

| Concern | Tool | Why |
|---------|------|-----|
| Layout primitives | Tailwind CSS v3.4 utility classes | The project has been on Tailwind v3 since scaffold; shadcn primitives are Tailwind-class-based |
| Theme primitives | CSS custom properties in `src/app/globals.css` | One file = one source of truth; HSL triplets so Tailwind's `hsl(var(--x))` convention works for shadcn components |
| Display family (H1) | **LXGW WenKai TC (霞鹜文楷)** loaded via `next/font/google` | Chinese art typography, modern kaiti, free & community-maintained. Used by `<ZhTitle>` for all H1/H2/H3 |
| Body family | **Inter** (Latin) + HarmonyOS Sans SC → PingFang SC → system (CJK fallback) | Wide CJK + Latin coverage; ships with Variable |
| Monospace | **JetBrains Mono** (Latin) + Cascadia Code → Consolas (fallback) | Used for code fields, raw JSON / MD editors, English small caps |
| Iconography | lucide-react (existing dep) | All page icons flow through one library; no hand-rolled SVGs |
| Loading | `next/font/google` self-hosted woff2 | Build-time download, no runtime external request |

## 2. Tokens

All design values are CSS custom properties in `globals.css` under
`@layer base :root` (and overridden in `[data-theme="light"]`).
Tailwind references them via `hsl(var(--x))` in semantic classes.

### 2.1 Color — neutral ramp (HSL triplets)

| Token | Dark (default) | Light (opt-in) | Use |
|-------|----------------|----------------|-----|
| `--color-neutral-background-1` | 222 20% 8% (`#0F1116`, card) | 0 0% 100% (card) | Card / surface |
| `--color-neutral-background-2` | 222 25% 4% (`#08090C`, page) | 0 0% 96% (page, 4% under card) | Page background |
| `--color-neutral-background-3` | 222 22% 11% | 0 0% 96% | Subtle hover / input |
| `--color-neutral-background-4` | 222 20% 14% | 0 0% 93% | Card-on-card hover |
| `--color-neutral-background-5` | 222 18% 18% | 0 0% 89% | Border on hover |
| `--color-neutral-background-6` | 222 15% 22% | 0 0% 85% | Dividers |
| `--color-neutral-foreground-1` | 240 9% 96% (15.4:1) | 0 0% 9% (18.6:1) | Primary text |
| `--color-neutral-foreground-2` | 240 5% 81% (9.1:1) | 0 0% 22% (10.3:1) | Secondary text |
| `--color-neutral-foreground-3` | 240 5% 56% (4.6:1) | 0 0% 46% (4.5:1) | Tertiary / metadata |
| `--color-neutral-foreground-4` | 240 5% 43% (3.0:1, large only) | 0 0% 60% | Muted (large only) |
| `--color-neutral-stroke-1` | 222 18% 14% (`#1F2229`) | 0 0% 89% | Hairline borders |

**WCAG AA contrast**: every (foreground, background) pair listed
above meets the threshold for its intended use (body / large / muted).

### 2.2 Color — brand (dual: dark mode sage, light mode azure)

| Token | Dark | Light |
|-------|------|-------|
| `--color-brand-background` | 162 45% 58% (`#4ebca5`, muted sage) | 217 80% 48% (`#1f6feb`, professional azure) |
| `--color-brand-background-hover` | 162 50% 64% | 217 85% 54% |
| `--color-brand-background-pressed` | 162 40% 48% | 217 75% 42% |
| `--color-brand-foreground-1` | 222 22% 9% (4.9:1) | 240 9% 98% (5.5:1) |
| `--color-brand-foreground-2` | 162 45% 58% | 217 80% 48% |
| `--color-brand-background-subtle` | 162 45% 58% / 0.18 | 217 80% 48% / 0.10 |

**Why a dual brand?** Dark mode keeps the muted sage green
(hue 162°, 冷淡 / minimalist) for the calm "sexless" feel that
harmonizes with the neutral gray ramp. Light mode uses a
professional azure (Microsoft / Stripe / Linear vibe) for the
calm-trustworthy feel that reads cleanly on a white page. Both
brands use the same `foreground-1` approach (dark text on dark
mode brand, light text on light mode brand) to hit AA contrast.
Success state stays in the sage family so dark mode brand +
status-success read as one family; on light mode the success
token shifts to a deep green that does not fight the azure.

### 2.3 Color — semantic

| Token | Dark | Light |
|-------|------|-------|
| `--color-status-success` | 162 45% 48% (sage family) | 146 80% 35% (4.7:1) |
| `--color-status-warning` | 38 92% 50% | 31 95% 44% (4.5:1) |
| `--color-status-error` | 0 84% 60% | 0 78% 50% (4.5:1) |
| `--color-status-*-subtle` | / 0.14 | / 0.10 |

Use `bg-destructive` / `text-destructive` (shadcn mapping) for error states.

### 2.4 Typography (Fluent 2 type ramp)

**3-token font system.** Every visible string on the page falls into
one of these three families — there are no rogue font overrides
anywhere in the codebase.

| Token | Family | Use |
|-------|--------|-----|
| `--font-family-base` | Inter / HarmonyOS Sans SC | Body (DEFAULT) |
| `--font-family-display` | **LXGW WenKai TC** / Source Han Serif SC | All H1/H2/H3 (Chinese art typography) — applied via `<ZhTitle>` |
| `--font-family-mono` | JetBrains Mono / Cascadia Code | Code, raw JSON/MD, English small caps |

**Utility classes** (defined in `globals.css`):

- `.font-display` → binds to `var(--font-family-display)` (LXGW WenKai)
- `.font-mono` → binds to `var(--font-family-mono)` (JetBrains Mono)

**Usage rule:** prefer `.font-display` / `.font-mono` utility classes
for direct font binding. For H1/H2/H3 page titles, use `<ZhTitle>` /
`<ZhCaption>` which already wrap the right family. Do NOT use inline
`style={{ fontFamily: "..." }}` — every font reference must flow
through one of the 3 tokens.

**Page-level utilities** (use these for hero h1/h2 instead of fixed sizes):

- `.text-fluid-display` → `clamp(36px, 6vw, 64px)` — homepage hero
- `.text-fluid-h1` → `clamp(28px, 4.5vw, 48px)` — page-level H1
- `.text-fluid-h2` → `clamp(22px, 3.5vw, 32px)` — section H2

**Type ramp** (Fluent 2 inspired):

| px | line-height | Use |
|-----|------------|-----|
| 11 | 14 | Caption2 |
| 12 | 16 | Caption1 (eyebrow) |
| 13 | 18 | Caption / metadata |
| 14 | 21 | Body1 — **default** |
| 16 | 24 | Body1 Strong |
| 18 | 26 | Subtitle / lede |
| 22 | 30 | Title3 / h2 |
| 28 | 36 | Title1 |
| 36 | 44 | Display |
| 48 | 56 | Display Large / h1 |

**CJK tuning** (on `body`): `font-feature-settings: "halt" 1, "palt" 1, "vkrn" 1; text-justify: inter-ideograph;` — applied via globals.css.

**Page-title pattern**: every page uses `<ZhTitle zh="…" en="…" size="h1" />` from `@/components/typography/zh-title`. The H1 inside the component binds to `--font-family-display` via inline style, so authors don't need to know about the font-family plumbing.

### 2.5 Spacing scale (4px base)

| Token | px | Use |
|-------|-----|-----|
| `--spacing-xxs` | 2 | Hairline |
| `--spacing-xs` | 4 | Tight |
| `--spacing-s` | 8 | Default gap |
| `--spacing-snudge` | 10 | Slight off-grid |
| `--spacing-m` | 12 | Field gap |
| `--spacing-l` | 16 | Card padding |
| `--spacing-xl` | 20 | — |
| `--spacing-xxl` | 24 | Section padding |
| `--spacing-xxxl` | 32 | Hero inset |
| `--spacing-hero` | 48 | Section break |
| `--spacing-mega` | 64 | Marketing hero |

Tailwind classes that reference the scale: `p-s`, `p-m`, `p-l`, `p-xl`, `p-xxl`, `gap-s`, etc. Don't use `p-3`, `p-4` (raw Tailwind values) — they bypass the system.

### 2.6 Border radius

| Token | px | Use |
|-------|-----|-----|
| `--radius-none` | 0 | — |
| `--radius-sm` | 4 | Buttons, inputs |
| `--radius-md` | 6 | — |
| `--radius-lg` | 8 | — |
| `--radius-xl` | 10 | **Card default (linux.do convention)** |
| `--radius-circular` | 9999 | Pills, avaters |

Tailwind `rounded-md` / `rounded-xl` / `rounded-full` map to these. The shadcn `--radius` semantic defaults to `--radius-xl`.

### 2.7 Glassmorphism

| Token | Dark | Light |
|-------|------|-------|
| `--glass-nav-bg` | `20 22 28 / 0.72` | `255 255 255 / 0.78` |
| `--glass-nav-blur` | 16px | 16px |
| `--glass-nav-saturate` | 180% | 180% |
| `--glass-modal-bg` | `20 22 28 / 0.85` | `255 255 255 / 0.88` |
| `--glass-modal-blur` | 20px | 20px |
| `--glass-dropdown-bg` | `28 30 38 / 0.92` | `252 252 252 / 0.94` |
| `--glass-dropdown-blur` | 12px | 12px |

Use the utility classes: `.glass-nav`, `.glass-modal`, `.glass-dropdown`. Don't compose the rgba + backdrop-filter inline.

### 2.8 Motion

| Token | Duration | Use |
|-------|----------|-----|
| `--duration-fast` | 150ms | Hover, focus |
| `--duration-normal` | 200ms | Default |
| `--duration-slow` | 300ms | Modals open/close |
| `--duration-slower` | 400ms | Page transitions |
| `--curve-easy-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | Default easing |
| `--curve-easy-in` | `cubic-bezier(0.7, 0, 0.84, 0)` | Exit |

### 2.9 Layout sizing

| Token | px | Use |
|-------|-----|-----|
| `--layout-content-max-width` | 1024 | Page content |
| `--layout-reading-width` | 720 | Long-form reading |
| `--layout-form-width` | 480 | Form pages |
| `--layout-auth-width` | 400 | Auth card |
| `--layout-top-nav-height` | 56 | Sticky nav |
| `--touch-target-min` | 44 | Mobile buttons / inputs |

Tailwind classes: `max-w-content` / `max-w-reading` / `max-w-form` / `max-w-auth` / `min-h-topnav` / `tap-target`.

## 3. Components

### 3.1 Existing shadcn primitives (do not rewrite unless token issue)

- `Button` — 6 variants (`default` / `destructive` / `outline` / `secondary` / `ghost` / `link`), 4 sizes. Add `rounded-full` for pill CTA (Sondaven voice).
- `Card` — 1 component, semantic sub-components (`CardHeader` / `CardTitle` / `CardDescription` / `CardContent` / `CardFooter`).
- `Input` / `Label` / `Textarea` — form fields; add `h-11` for 44px touch target on mobile.
- `AlertDialog` — for destructive actions. **Always use `bg-card`**, never `bg-background`.
- `Tabs` — 2px brand underline indicator (active state).
- `Select` — format picker for raw JSON / MD.

### 3.2 Composition patterns

- **Page layout**: `main.max-w-content.px-4.py-12.md:px-8.md:py-20`
- **Header row**: `<div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">`
- **Card grid**: `<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">`
- **Form stack**: `<form className="space-y-4">` with `<div className="space-y-2">` per field
- **Empty state**: `<div className="rounded-xl border border-dashed border-border/60 bg-card/40 px-6 py-16 text-center">`
- **Error alert**: `<p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">`
- **KPI meta-line** (Sondaven): `<dl className="mt-10 flex flex-wrap gap-x-8 gap-y-4 border-t border-border/60 pt-6 text-sm">` with `<KpiCell value="…" label="…">` children

### 3.3 When to add a new shadcn component

`pnpm dlx shadcn@latest add <name> --yes --overwrite` — then **verify
the `"use client";` directive is at the top of the file**. If it's
missing, add it manually. Then `pnpm typecheck`.

Common additions for upcoming phases: `dropdown-menu`, `popover`,
`tooltip`, `toast`, `sheet`, `command`, `skeleton`, `breadcrumb`.

## 4. Responsive discipline

Every page must work at 360 / 768 / 1024 / 1440. Use the Tailwind
breakpoints (`sm` / `md` / `lg` / `xl`). Don't introduce custom
breakpoints.

Layout switch rules:

- **Below 640px (mobile)**: 1-up grids, full-width buttons, h1
  shrinks via `text-fluid-h1` clamp
- **640-1023px (tablet)**: 2-up grids, button min-height ≥ 44px
- **≥ 1024px (desktop)**: 3-up grids, full nav, full CTAs

**Touch targets**: every interactive element ≥ 44×44px on mobile.
Use `.tap-target` utility or `h-11` (44px) on buttons / inputs.

## 5. Voice selection

**Single voice across the entire product**: A · Community (Inter body
+ LXGW WenKai display + 中文主标 / 英文 mono 副标). There is no
"marketing voice" — even the homepage uses the same LXGW WenKai H1
+ Inter body. We removed the old Voice D (Sondaven / Cormorant
Garamond) because the project is positioned as a personal study
tool, not a marketing site, and the dual-voice architecture added
complexity without payoff.

| Surface | Voice | Notes |
|---------|-------|-------|
| `/` (homepage) | A · Community | Hero uses `<ZhTitle size="display">` with `glass-card` wrapper |
| `/login`, `/register` | A · Community | AuthShell wrapper, 400px card |
| `/decks` (list) | A · Community | Responsive 1/2/3/4/5-col grid |
| `/decks/[id]` (detail) | A · Community | Dynamic deck title via `<ZhTitle>` |
| `/decks/[id]/settings` | A · Community | Form-heavy, glass-card sections |
| Future `/study` / `/stats` | A · Community | Time-critical, no decoration |

## 6. Anti-patterns

- ❌ Raw hex in JSX (`bg-[#ff8a3d]`, `text-[14px]`)
- ❌ Tailwind palette values not in our scale (`p-3`, `text-sm`,
  `text-neutral-600`) — replace with token-mapped classes
- ❌ `<button>` without explicit height (must be ≥ 44px on mobile)
- ❌ `<div role="button">` (use `<button>`)
- ❌ `bg-background` in dialogs / popovers (use `bg-card` /
  `glass-modal`)
- ❌ Inline `style={{ fontFamily: "..." }}` (use `.font-display` /
  `.font-mono` utility classes or `<ZhTitle>` / `<ZhCaption>` — every
  font reference must flow through the 3-token system)
- ❌ `font-display: italic` (Cormorant era — banned; LXGW WenKai
  is upright kaiti, never italic)
- ❌ Em-dash (`—`) anywhere in visible strings (use regular hyphen)
- ❌ `<PrismaClient.deck.delete>` (use `deleteMany` for idempotency)
- ❌ shadcn component without `"use client"` when used in a
  client-component tree
- ❌ Login-as-middleware-only (always re-validate `auth()` in
  Server Actions — defense in depth)
- ❌ new dependencies without exact version pinning

## 7. How to add a new surface

1. Single voice: A · Community (§5). No exceptions.
2. Use only token-mapped classes (§2 + §3.2). No raw values.
3. Use `<ZhTitle>` for every H1/H2/H3. Use `<ZhCaption>` for
   meta lines.
4. Use the existing primitives (`Button`, `Card`, `Input`,
   `AlertDialog`, `Tabs`, `Select`). They already carry
   `glass-card` / `glass-input` / `glass-modal` etc.
5. Build at 360 / 768 / 1024 / 1440 / 1920 before committing.
6. Test theme toggle (`data-theme="light"` / `data-theme="dark"`) —
   no transparency leaks, no contrast losses.
7. Document any new token in §2 if you added one.
8. Update this file (`docs/DESIGN_SYSTEM.md`) AND `CLAUDE.md`
   if you added a new anti-pattern or new component.
