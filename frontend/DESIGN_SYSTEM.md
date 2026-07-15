# EZWill design system (Manus)

The frontend follows the **Manus** visual language — a warm, lawyer-grade estate-planning aesthetic. This is applied **app-wide** via foundation tokens, so individual pages inherit it automatically.

## Palette

| Token | Hex | Use |
|---|---|---|
| navy | `#1B2A4A` | Primary: buttons, active states, key headings, focus rings |
| navy-dark | `#16233d` | Navy hover |
| sage | `#7BA68C` | Positive / complete / eco accents, success ticks |
| gold | `#C9A84C` | Premium highlights: step numbers, "recommended" badges, caution callouts |
| cream | `#FAF8F5` | Page background |
| line | `#E8E4DF` | Borders / dividers |
| ink | `#2D2D2D` | Body text (often at `/70` `/60` `/50` opacity) |

These are exposed as Tailwind utilities via `@theme` in `globals.css`: `bg-navy`, `text-sage`, `border-line`, `bg-gold`, `bg-cream`, etc. Arbitrary values (`bg-[#1B2A4A]`) are also used, especially on the landing which was transcribed 1:1 from the Manus source.

## Type

- **Playfair Display** — all `h1/h2/h3` app-wide (base rule in `globals.css`), plus the `.text-display` utility for serif on non-heading elements.
- **Inter** — body.
- The legal document editor (`.will-editor`) keeps its own **Calibri** stack — explicitly overridden so generated wills never render serif.

Both fonts load via `next/font/google` in `app/layout.tsx` (`--font-playfair`, `--font-inter`).

## Components

- **Button** (`components/ui/button.tsx`) — `default` variant is **navy** (was amber). Plain `<Button>` is the primary CTA everywhere. `outline`/`ghost`/`secondary` are navy-tinted.
- **Form controls** (`input`, `select`, `textarea`, `checkbox`, `radio-group`, `progress`, `badge`, `dialog`) — recolored to navy focus rings / navy-checked / sage-positive. `badge` `warning` intentionally stays amber (semantic).
- **Brand** (`components/ui/brand.tsx`) — `EzWillLogo` (renders `/public/ezwill-logo.png`; pass `invert` to flip it white on dark backgrounds) and `BrandLockup` (logo + wordmark). Used in the landing nav/footer, the will wizard header, and the dashboard login/sidebar. Favicon is `src/app/icon.png` (same logo, via Next's file convention).
- **Landing** (`app/page.tsx`) — reference implementation; faithful port of the Manus home page (framer-motion `whileInView`, shadcn accordion FAQ, navy value-comparison, gold-badged pricing).
- **Will wizard** (`components/will/wizard-shell.tsx`, `step-header.tsx`) — Manus questionnaire look: cream, navy tabbed nav with active underline, sage-complete, sub-step dots, navy Continue + ghost Back, Save & Exit.

## ⚠️ Do not re-introduce a blanket CSS reset

`globals.css` must **not** contain `* { margin: 0; padding: 0 }`. Being unlayered, it silently overrides *every* Tailwind margin/padding utility app-wide (`mx-auto`, `px-4`, `py-20` all compute to `0`), which collapses page spacing and un-centers layouts. Tailwind v4 preflight already resets margins/padding correctly inside `@layer base`. Only `* { box-sizing: border-box }` is kept.

## Images

Drop-in assets live in `public/` (see `public/README.md`). `hero-family.jpg` is the only landing photo; until added, the hero shows an intentional warm placeholder panel (not a broken box).
