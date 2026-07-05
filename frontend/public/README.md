# Landing-page images

Drop the Manus-generated images here with these **exact** filenames and they appear automatically (no code changes):

| File | Where it shows | Status if missing |
|---|---|---|
| `hero-family.jpg` | The hero photo (right column, desktop) | Falls back to a navy→sage gradient panel + the "Will Generated Successfully" card (looks intentional) |

Notes:
- **Logo** is an inline SVG in `src/app/page.tsx` (`EzWillLogo`) — crisp at any size and inverts in the footer. Swap to your generated `ezwill-logo.png` only if you prefer it.
- **Hero background texture** is currently a subtle CSS dot pattern (no file needed). If you want your `hero-abstract.png`, say so and it can be wired into the hero + final CTA at low opacity.

Save `hero-family.jpg` at ~1600×1200 (4:3). It's `object-cover`, so a slightly darker/softer lower third keeps the overlay card readable.
