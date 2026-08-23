# dipia — design brief for Claude Design

**Design system: Dipia.** Warm cream, coral, rounded display type, hard toy shadows,
pixel-art sprites over crisp UI. Light-only.

This replaces the earlier dark system (brand cyan, OKLCH, Instrument Serif + Geist,
`.glow`), removed in commit `d6e0d4d`. **Nothing from that system is current.** If you
have seen an older version of this brief, discard it.

## How to use this file

Paste from the `# THE PROMPT` heading down. Everything above it is orientation for the
person running the handoff.

**Attach with it:**

| File | Why |
| --- | --- |
| `design-tokens.json` | Exact hex values, the lens mechanism, the rules. So the model never re-derives a colour by eye. |
| `screenshots/` | The system as actually rendered, straight from `/design`. Nothing mocked. |

The living reference is the `/design` route — every token, every lens, every component
state. When this file and `/design` disagree, `/design` wins, and this file is stale.

---

# THE PROMPT

## 1. What you are working on

**dipia** is a simulation engine for human relationships, built for a 36-hour hackathon
in Bogotá. About 100 people in one room fill in a short questionnaire on their phones, and
the engine ranks who in that room would actually matter to them — romantically,
professionally, or as a friend.

The product loop: **intake → avatar → lens → ranking → a simulated life timeline → an AI
baby (romantic only)**.

The audience is a room of hackathon attendees on venue wifi, on phones, standing up, with
a few minutes of patience. **Completion rate is the demo.** A screen that is beautiful and
loses people at block 4 has failed.

## 2. The moment this exists for

Someone taps a QR code, registers, answers fifteen quick funny questions about everyday
chaos — burnt rice, a cat that shredded the couch, a friend who is late again — and then
watches the room rearrange itself around them: here are the people you would have mattered
to, and here is the life the two of you would have had.

The design job is to make six minutes of forms feel like a game, and the payoff feel
earned.

## 3. Hard constraints — not negotiable

- **Mobile first, 390×844.** Desktop is a courtesy. Every decision is made at phone size.
- **Light-only.** There is no dark theme. `--dark` is a *surface* — the room's night
  canvas — not a mode.
- **No raw hex.** Tokens only. ESLint fails the build on `bg-[#0ff]` or a `style` prop
  colour.
- **Spanish UI**, neutral Latin American as spoken in Bogotá.
- **Never edit `src/components/ui/**`.** That is shadcn-owned. Compose into
  `src/components/<feature>/`.
- **Reduced motion is respected.** Every animation stops under
  `prefers-reduced-motion`.

## 4. The system as it stands

### Brand

`dipia`, always lowercase, one word, tight tracking. The wordmark *is* the logo, set in
Baloo 2 extrabold, usually next to a coral dot carrying a toy shadow.

### Colour — warm, never grey

The ground is cream `#f7f1e3` and the ink is warm brown `#33261d`. **Nothing in this
system is grey.** The interface has temperature before an accent ever appears.

Coral `#d95f4b` is both the product accent and the romantic lens — the same value,
deliberately. Use `--brand` for a mark that must *not* follow the lens.

### The lens mechanism — understand this before changing anything

Three compatibility lenses. Each is a class that redefines a handful of tokens:

```
.lens-romantic    coral   #d95f4b   shadow #a8422f
.lens-business    violet  #5a4a8a   shadow #3f3363
.lens-friendship  green   #4a7a3a   shadow #35592a
```

Put the class on any subtree and everything inside retakes its temperature — buttons,
rings, tints, borders **and shadows**, because the toy shadow reads from
`--primary-shadow`. One class. No conditional rules anywhere.

Violet and green are lifted from the timeline's own tag palette (HITO, MASCOTA) so the
system speaks one language. **Friendship is deliberately not amber:** amber already means
friction on the timeline, and reusing it would make the warmest relationship read as
conflict.

### Typography — two voices

| Token | Face | Job |
| --- | --- | --- |
| `--font-display` / `--font-heading` | **Baloo 2**, 500/700/800 | Headings, wordmark, CTAs. Rounded and heavy. |
| `--font-sans` | **Nunito Sans**, 400/600/700 | Body, labels, option text. |
| `--font-mono` | system mono | Data, ids, option keys, eyebrow labels. |

`--font-heading` points at Baloo, so shadcn's Card, Dialog and Sheet titles get the
display voice for free. `h1/h2/h3` are styled in `@layer base` — a bare heading is
already right.

### Shape and depth — the signature

`--radius: 1rem`, and every step derives from it.

Depth is a **hard offset block**: `0 4px 0 var(--primary-shadow)`. No blur. No spread. It
does not imitate light; it imitates one physical object resting on another. That is the
single most recognisable thing about this system — treat it as load-bearing.

- `shadow-toy` / `shadow-toy-lg` — follow the lens
- `shadow-card` — neutral resting depth
- **Pressed** is a pattern, not a token: `translateY(4px)` plus `0 0 0`. The object
  touches the table.
- **Flat at rest.** A card carries `shadow-card` or nothing; `shadow-toy` is how the
  system says *this one*.

### Pixel art

Sprites are authored small and scaled up with `image-rendering: pixelated`. **The pixel
lives in the art** — avatars, venue, board. Type and controls stay crisp. The contrast
between the two is the whole look; blur the boundary and it dies.

### Rhythm

8px baseline. Even steps on Tailwind's 4px scale: `gap-2`, `gap-4`, `gap-6`, `p-4`,
`space-y-6`. Odd steps only for optical detail inside a component.

### Components available

23 shadcn primitives — see `design-tokens.json`. No `form`; the registry replaced it with
`field`.

## 5. What I want from you

### Priority 1 — the quiz block (the screen that decides the demo)

Fifteen blocks, each a short funny scenario with **four text options in a 2×2 grid**. This
used to be four illustrated cards; per-option images were cancelled, so the cards are now
**type only** — and nobody has designed what that looks like.

The problems, in order:

1. Four cards plus the scenario must fit a 390px screen **without scrolling**, fifteen
   times in a row, without becoming monotonous.
2. Option text is ≤8 words. The card is mostly empty. What fills it — scale, weight, a
   key letter, texture, nothing?
3. Selection has to be unmistakable at a glance and at arm's length. `shadow-toy` is the
   obvious tool.
4. There is a **most / least** interaction: the participant marks the most like-them
   option and the least. Two selection states on one grid, distinguishable without colour
   alone.

### Priority 2 — the room graph

~100 pixel sprites on the dark canvas, on a phone, without becoming noise. This is the
pitch's visual climax and the densest layout problem in the product.

### Priority 3 — the AI baby reveal

The emotional peak, currently a blank. Romantic lens only, and only for mutually opted-in
pairs.

### Priority 4 — timeline choreography

Canonical life events arriving beat by beat, with the seven tag types carrying their own
colours. It should feel narrated, not loaded.

### Priority 5 — the waiting moments

Ranking takes seconds; the baby render takes longer. Loading states here are content, not
spinners.

## 6. Constraints to design around, not away

- **Venue wifi, ~100 phones.** Heavy imagery is a completion risk.
- **Six to nine minutes of intake.** The declared round runs first as demo insurance:
  someone who abandons at block 4 still ranks.
- **The room is public.** Rankings are visible only to the person who ran them, and only
  *mutual* matches surface publicly. Never design a screen that leaks a one-sided result.
- **Photos are optional and consent is per lens.** A profile without a photo still has to
  look intentional.

## 7. Do not change these

- The lens mechanism — a class that redefines tokens, cascading to shadows
- The hard offset shadow. No blur creeps in anywhere
- Light-only
- Warm cream ground, warm brown ink, no greys
- Amber means friction, never a lens
- Destructive `#9a2b1e` stays distinct from coral
- Pixel in the art, crisp in the chrome
- `dipia` lowercase

## 8. Two things I already suspect are wrong

- **The 2×2 grid may be wrong for text.** Four stacked full-width rows might read faster
  on a phone and scale better with longer options. I kept the grid because it was
  art-directed for images; challenge it.
- **Fifteen near-identical screens is a completion risk.** Something has to change as the
  participant advances — progress, tone, batch transitions — without adding taps.

## 9. What good output looks like

Real Spanish copy from the product, not lorem. Mobile frames first. Tokens named, not hex
values invented. And where you break one of my rules, say so and say why — a good argument
beats the rule.
