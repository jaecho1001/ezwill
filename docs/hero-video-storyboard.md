# EZWill Hero Film — Storyboard & Treatment

**For:** the landing hero (`frontend/src/app/page.tsx`) · Vaturi & Cho LLP
**Tracking issue:** [#66](https://github.com/jaecho1001/ezwill/issues/66)
**Visual version:** the same treatment as a designed page — https://claude.ai/code/artifact/0c24d8ed-c4bb-4114-b005-51ae17e1585d _(private Claude artifact; share from its menu if a teammate needs it)_

---

## Concept — "So they never have to guess."

A warm, wordless ~14-second loop with the people a will is really *for* — ending in the quiet relief of it being done. The film is the visual proof of the hero headline *"Your love, in writing — so they never have to guess."*

**The single creative rule:** sell **love and peace of mind**, never death and fear. A will as an act of care, not a memento mori.

| | |
|---|---|
| Duration | ~14s, **seamless loop** |
| Audio | Silent (muted autoplay) |
| Look | Golden-hour warmth |
| Subject | Ontario families |
| Aspect | ~1:1 (hero card) |

### Do — show life
Hands, faces at ease, a child's laugh, tea steam, a shared exhale, negative space, slowness. Warmth you can feel. *(tender · unhurried · real homes · candid)*

### Don't — sell fear
No funerals, hospitals, empty chairs, black clothing, tears, ticking clocks or calendars. *(no urgency · no grief · no legalese props)*

---

## Storyboard — five shots

Sized for the right-hand hero card (near-square). Each shot is slow and silent; cuts are soft. **Shot 05 is composed to match Shot 01's window light so the clip loops without a seam.**

### Shot 01 — "The hands that come after" · `0:00–0:03`
Extreme close-up: a grandparent's weathered hands gently guide a small child's hands to press a seed into soil in a windowsill pot (or fold a paper boat). The first touch of the film is tactile and tender.
- **Camera:** Macro, shallow focus, locked-off with a breath of handheld. Slow push-in.
- **Light:** Low golden-hour sun through a window; warm rim on the hands.
- **Beat:** *Continuity* — what you pass on.

### Shot 02 — "What's at stake, laughing" · `0:03–0:06`
A parent in soft-focus foreground watches two children build a blanket fort on the living-room rug. Rack focus from the parent's small, unguarded smile to the kids — the reason it all matters, shown, not stated.
- **Camera:** Over-shoulder two-plane; rack focus parent → children.
- **Light:** Soft diffused lamp plus window fill; cozy, low contrast.
- **Beat:** *Love* — the people it's for.

### Shot 03 — "Doing it together, unhurried" · `0:06–0:10`
Evening. A couple sits close at the kitchen table over a single laptop or tablet, two mugs of tea steaming. One rests a hand over the other's; a calm, decided nod. Any on-screen UI stays out of focus — just a soft sage tick, never readable legal text.
- **Camera:** Two-shot, slow side dolly-in. Steam catching the light.
- **Light:** Warm pendant pool over the table; the room dim around them.
- **Beat:** *Calm agency* — handled together, at home.

### Shot 04 — "The quiet yes" · `0:10–0:12`
Tight insert: a fingertip taps, and a gentle sage checkmark blooms on the screen. Cut to a tight two-shot — a shared exhale, shoulders softening, a look between them. The emotional payoff: *it's done.*
- **Camera:** Insert on hand/screen → tight two-shot.
- **Light:** Same pendant pool; soft screen glow on relaxed faces.
- **Beat:** *Relief* — the weight lifts.

### Shot 05 — "Settled" · `0:12–0:14 ↻`
Wide and warm: the family folds onto the couch under a lamp — kids leaning in, maybe a dog — a slow settle into stillness. The final frame's warmth and colour echo Shot 01's window light so the loop rejoins invisibly.
- **Camera:** Slow pull-back to a static, breathing hold.
- **Light:** Single warm lamp; deep, cozy shadows.
- **Beat:** *Peace* — protected, together. → loops to 01.

### Emotional arc
`Continuity (0:00) → Love (0:03) → Calm action (0:06) → Relief (0:10) → Peace (0:12)`
One rising line from what you leave behind to the calm of leaving it right — resolving, never alarming.
**↻ Loop join:** Shot 05 lamp-warmth → Shot 01 window-warmth (match colour temp & framing for a seamless cut).

---

## Casting & look

Cast for warmth and realism over gloss — ordinary people, real homes, mid-30s to 70s. Because the intake questionnaire ships in English **and** 한국어, featuring a **Korean-Canadian family** in the "together" shots is authentic, not tokenised — and quietly signals the bilingual promise.

- **People & wardrobe:** Multi-generational, genuinely diverse. Soft, unbranded neutrals — oat, sage, warm grey. Nothing loud, no logos, no "corporate" polish.
- **Palette on screen:** Cream, warm wood, sage, a brass/gold lamp glow, soft navy shadow — the brand, lit. Golden-hour and practical lamps only; skip clinical daylight.
  - cream `#FAF8F5` · sage `#7BA68C` · deep green `#3E6B54` · gold `#C9A84C` · navy `#1B2A4A`

---

## How to make it — three routes

**Recommended: hybrid** — real footage where hands and faces sell trust, AI or stock for the ambient wides.

| Route | Best for | Pros | Cons |
|---|---|---|---|
| **Hybrid** ✅ | the demo hero | Real hands/faces on close-ups (01, 03, 04); AI/stock for wides (02, 05) | A little curation to colour-match clips |
| **Licensed stock** | fastest realistic | Real humans, cleared commercial rights | Less bespoke; search Artgrid / Filmsupply / Getty for "family golden-hour home candid" |
| **AI-generated** (Sora · Veo 3 · Runway · Kling) | ambient wides, iteration | Cheapest, fastest | Still weak on close-up hands/faces (uncanny on 01/04). Verify **commercial licence**; avoid real-person likenesses |

---

## Paste-ready AI generation prompts

Each tool makes ~5–10s clips, so generate the five separately and stitch. Append the shared style line to every clip and keep the negative prompt on.

**Shared style suffix (append to each):**
```
cinematic, photorealistic, natural golden-hour light, shallow depth of field,
gentle slow motion, warm earthy palette (cream, sage green, warm wood, soft brass),
handheld but steady, subtle film grain, 4:5 near-square, seamless loopable,
no text, no on-screen captions, no logos, muted
```

**Negative prompt:**
```
funeral, hospital, black mourning clothes, crying, clock, calendar, on-screen text,
watermark, distorted hands, extra fingers, uncanny faces, harsh daylight, clutter
```

**Clip 01 — the hands that come after**
```
Extreme close-up of an elderly grandparent's weathered hands gently guiding a
small child's hands to press a seed into soil in a windowsill pot, warm window
light, macro shallow focus, slow push-in.
```

**Clip 02 — what's at stake, laughing**
```
A parent in soft-focus foreground watches two young children build a blanket fort
on a living-room rug, the parent's warm unguarded smile, rack focus from parent to
children, cozy lamp light.
```

**Clip 03 — doing it together, unhurried**
```
An evening kitchen table, a couple in their 40s sit close over a single laptop with
two steaming mugs of tea, one hand resting over the other, a calm decided nod, warm
pendant light pool, slow side dolly.
```

**Clip 04 — the quiet yes**
```
Tight insert of a fingertip tapping a tablet screen and a soft green checkmark
gently appearing, then a relaxed shared exhale between a couple, screen glow on
calm faces, warm dim room.
```

**Clip 05 — settled (loop frame)**
```
Wide cozy shot of a multigenerational family settling onto a couch under a warm
lamp, children leaning into parents, slow pull-back, deep warm shadows, peaceful
stillness; final framing and colour temperature match a warm sunlit window.
```

> **Trust-brand caution:** AI faces and hands still read "off" in tight shots. Generate a few takes of Shots 01 & 04 and if any look uncanny, use stock or a 20-minute phone shoot for those two — the rest can be AI.

---

## Drop-in hero spec

Deliver these three files into `frontend/public/` and the hero swaps from placeholder to film with a poster fallback and a reduced-motion guard.

| Field | Value |
|---|---|
| Placement | Right-hand hero card (~568 × 480, near-square). Export a 1:1 master; it's `object-cover`, so it crops to fill. |
| Duration | 12–15s, **seamless loop** (first and last frame match). |
| Resolution | 1080 × 1080 master; ship 720p — plenty inside a card. |
| Files | `hero-family.mp4` (H.264, faststart) · `hero-family.webm` (VP9) · `hero-family.jpg` (poster = first frame). |
| Playback | `autoplay muted loop playsInline preload="metadata"`; poster paints instantly, video fades in when ready. |
| Weight | Under ~2.5 MB — it's decorative; compress hard. |
| Reduced-motion | If the viewer prefers reduced motion, show the poster only (no autoplay). Keep the existing bottom navy gradient + "Will Generated Successfully" card for legibility. |

**Wiring (dev):** replace the hero `<img>` with a `<video>` (poster + `<source>` mp4/webm), fall back to the current warm placeholder if the files are absent, and gate autoplay behind `useReducedMotion()`.

---

_Storyboard frames in the visual version are colour/lighting reference blocks, not final footage. Depicted people are illustrative concepts — cast and clear real talent before use._
