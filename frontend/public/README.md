# Brand assets

These files are served at the site root by `next start` (the Dockerfile copies
`public/` into the runner). All three are already present and wired in:

| File | Where it shows |
|---|---|
| `ezwill-logo.png` | Nav + footer + wizard/dashboard headers + favicon (`src/app/icon.png`). Rendered via `EzWillLogo` in `src/components/ui/brand.tsx`; the footer/dark uses of it pass `invert` to flip it white. |
| `hero-abstract.png` | Topographic texture behind the landing hero and final CTA, at low opacity (`src/app/page.tsx`). |
| `hero-family.jpg` | The hero photo (right column, desktop). If missing, the hero shows an intentional warm placeholder panel with the "Will Generated Successfully" card. |

To swap the hero photo, replace `hero-family.jpg` (~1600×1200, 4:3, `object-cover`; a
slightly darker lower third keeps the overlay card readable), then rebuild the
frontend image. The current `hero-family.jpg` is a labelled placeholder — replace
it with a real lifestyle photograph.
