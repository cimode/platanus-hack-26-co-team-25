# hookai — design brief: the quiz block screen

> **How to use this file.** Paste everything from _"THE PROMPT"_ down into Claude Design as your
> opening message. Everything above it is orientation for whoever runs the handoff.

**Attach these:**

| File | Why |
| --- | --- |
| `sketch-quiz-block.png` | **The layout, already decided.** Read it as structure, not as style. |
| `design-tokens.json` | Exact OKLCH token values. Do not let the model re-derive a colour by eye. |
| `screenshots/99-overview-mobile.png` | 390×844, the actual target device |
| `screenshots/03-surfaces.png` | The neutral surface ramp the cards sit on |
| `screenshots/05-shape-glow.png` | Radius scale, resting vs active glow |
| `screenshots/06-controls.png` | Current controls at mobile sizes |
| `quiz/batch-1.json` | The literal content of the first five blocks |

---

# THE PROMPT

## 1. What you are working on

**hookai** is a simulation engine for human relationships, built for a 36-hour hackathon
(Platanus Hack 26, Bogotá — Simulations track). Everyone in a venue fills a mobile intake;
the engine builds a personality profile per person, ranks the room under a chosen lens
(romantic / business / friendship), then simulates a shared life with whoever you pick — a
timeline of canonical events across years, ending in an AI-generated face of their child.

You are designing **one mobile screen: the quiz block.** It repeats **fifteen times** and it
produces every number the rest of the product runs on.

A block is a forced-choice item: a short everyday scenario, then **four options — one per
measured trait** (Regulation, Politeness, Reliability, Agency). Each option is an illustrated
card. The respondent does not rate anything; they choose among the four.

## 2. The layout is decided — see `sketch-quiz-block.png`

Do not redesign the structure. It is:

```
        [ hookai wordmark / progress ]

              Short question

        ┌───────────┐  ┌───────────┐
        │  image 1  │  │  image 2  │
        └───────────┘  └───────────┘

        ┌───────────┐  ┌───────────┐
        │  image 3  │  │  image 4  │
        └───────────┘  └───────────┘
```

Question on top, **2×2 grid of four equal rounded cards** below it, each card an illustration
with its option text as a centered caption. Your job is to make this specific arrangement work
at **390×844 in the hookai design system** — spacing, type, states, motion, and the problems
listed in §6 and §7.

**Two things in the sketch are placeholder, not instruction:**

- The words "Question format" are a label on the sketch. They are not screen copy.
- **The four card colours are wrong and must not survive.** Four differently-coloured cards
  imply four categories — and there *are* exactly four traits behind those four options, one
  each. Colour-coding them would leak the instrument's structure to the respondent, teach them
  the pattern by block 3, and destroy the desirability matching §3 depends on. **All four cards
  must be visually equal**: same treatment, same weight, same temperature. Any difference
  between them must come from the illustration content alone.

Note also that the sketch runs the bottom row off the edge. At 390×844 that is a real problem,
not a sketching artifact — see §7.1.

## 3. Why this screen decides the demo

1. **Completion rate is the substrate.** ~100 attendees fill this on their phones hours before
   the pitch. If they abandon, there is nothing on stage. A declared round (taps + a tag picker)
   runs first as insurance; this quiz round is **4–6 minutes** and is where abandonment actually
   happens. Fifteen repetitions of one screen is a completion problem disguised as a layout problem.
2. **It is the technical-depth argument made visible.** Judging is 25% technical depth, the
   heaviest single criterion. With four latent traits and blocks of four, every block loads all
   four traits, so every trait *pair* co-occurs in all fifteen blocks. That balanced design is
   the defensible claim. Make the machinery feel present without turning the screen into a
   psychometrics lecture.
3. **Exactly one option per block is reversed-keyed** — the low pole of that block's focus
   trait. Non-negotiable and irreversible once the form ships: with all options positively
   keyed, the instrument carries *zero* information about trait levels (simulated recovery ~.19,
   versus .93–.95 with one reversed option per block). The reversed option is written to stay
   likable and funny, never villainous. **Nothing in your design may mark, tint, order, badge, or
   otherwise hint at which option is reversed** — and per §2, nothing may hint at which trait any
   option belongs to either. If a respondent can spot "the good answer" in three seconds, the
   block is dead. **Desirability matching is a visual requirement, not just a copy one.**

## 4. The elicitation — the one interaction you must invent

The intended form is **most + least**: mark the option *most* like you and the one *least* like
you. That observes five of six pairwise orderings per block instead of three, and it is the
difference between a usable instrument and a thin one.

It is also the biggest risk on the screen: two marks per block, fifteen times, on a phone, with
no instructions anyone will read.

**Design it.** It has to be learnable in one block without a tutorial, reversible, and it must
never allow both marks on the same option or advance with only one mark. Give me the affordance,
the feedback, the conflict case, and how the two marks read as *different* without reading as
good/bad — a "least like me" mark must not look like a penalty or a wrong answer.

**Then design the fallback**: single-pick, "most" only. Dropping most+least is first in the
agreed cut order if completion binds, so the 2×2 must degrade to one tap per block with no
redesign.

## 5. The literal content — copy is fixed, invent none of it

Real generated content, Spanish (Colombian/neutral, tuteo). Use verbatim.

### Block 1 — the first block anyone sees (focus: Regulation · food)

> **Tu amigo movió la perilla del horno y el pollo lleva una hora crudo. Los invitados ya están
> tocando el timbre.**

| Card | Option text | Trait | Keyed |
| --- | --- | --- | --- |
| 1 | Sigo el plan: pollo tarde, pero pollo | reliability | positive |
| 2 | Anuncio que la cena está oficialmente arruinada | regulation | **reversed** |
| 3 | Tomo el mando: pedimos pizza y listo | agency | positive |
| 4 | Culpo a la perilla, nunca a mi amigo | politeness | positive |

### Block 2 (focus: Politeness · pets)

> **Cuidas el gato de un amigo y encuentras tu sillón nuevo hecho tiras. Tu amigo jura que el
> gato nunca hace eso.**

`1` Tapo el hueco con un cojín, me río · `2` Decido: llamo al tapicero y coordino todo ·
`3` Termino la semana de cuidados igual · `4` Le recuerdo cada desastre suyo desde 2019 **(reversed)**

### Block 3 (focus: Reliability · travel)

> **Llegan al camping y descubren que nadie trajo las varillas de la carpa. El suelo quedó hecho
> un barrial.**

`1` Me tiro al barro y hago un ángel · `2` Ni un te-lo-dije sale de mi boca ·
`3` Reservo un hostal y duermo bajo techo **(reversed)** · `4` Reparto tareas y armamos refugio con ramas

### Block 4 (focus: Agency · friends)

> **Es noche de películas y te tocó el control remoto. Tu propuesta ya fue vetada tres veces y
> todos siguen gritando títulos.**

`1` Le paso el control al primero que grite **(reversed)** · `2` Vetan mi peli y ya se me pasó ·
`3` Aplaudo su pésimo gusto sin nada de ironía · `4` Me quedo despierto hasta los créditos finales

### Block 5 (focus: Regulation · family)

> **Tu mamá reorganizó toda tu cocina mientras te visitaba. Ahora nada está donde debería y el
> azúcar desapareció.**

`1` Elogio el orden nuevo aunque no encuentre nada · `2` Reviso cada cajón tres veces, por si acaso **(reversed)** ·
`3` Decreto un orden nuevo y etiqueto todo · `4` Cocino la cena aunque tarde el triple

**Design against the worst case, not the average one:** the longest option is *"Elogio el orden
nuevo aunque no encuentre nada"* (44 characters) and the longest scenario is block 4 at 118
characters over two sentences. The sketch says "short question"; the real content is two lines
of scenario minimum at mobile width. Make the layout hold that.

## 6. The design system — not negotiable

- **Dark only.** No light theme, no toggle. It will not be built.
- **390×844 mobile web PWA.** The phone is the device in a venue.
- **Stack is fixed:** Next.js 16 App Router, React 19, Tailwind v4 (CSS-first `@theme`, no config
  file), shadcn/ui on Radix, `radix-nova` style, `lucide` icons. Every colour is an OKLCH custom
  property.
- **Tokens are the only styling source.** No raw hex, no arbitrary spacing, no one-off radius. If
  you need a colour that is not a token, name a new token and give its OKLCH value.
- **Brand cyan `oklch(0.72 0.15 200)` governs this screen.** It means *hookai itself — the engine*.
  **The three lens hues must not appear anywhere here**: rose `oklch(0.645 0.246 16.439)`, violet
  `oklch(0.606 0.25 292.717)`, amber `oklch(0.769 0.188 70.08)`. No lens is chosen at intake, so
  using one would be a lie about the state of the system. This is a second, independent reason the
  sketch's four colours cannot ship.
- **Three type voices, roles never swapped:**
  - `font-narrative` (Instrument Serif) — *a life being told*. Deliberately rare, ~3 uses per
    screen. **The scenario is the strongest candidate here; argue it either way.**
  - `font-sans` / `font-heading` (Geist) — the interface. Body, labels, all card titles.
  - `font-mono` (Geist Mono) — *the engine reporting*. The block counter belongs here.
- **`--radius: 1rem`. Hairline borders. Flat at rest** — no ambient shadow, no ambient glow. The
  sketch's radius reads larger than `1rem`; if you want the cards at `2xl`, say so and name the
  token. `.glow` / `.glow-brand` / `.glow-sm` are **active / selected / focused only**, and `.glow`
  reads from `--primary`, so it is cyan here. Everything staying flat at rest is what makes the
  glow mean something. Hold that line — it is also the whole selection language of this screen.
- **23 components installed and themed** — prefer them over anything new: `button` `card` `input`
  `label` `textarea` `field` `select` `radio-group` `slider` `checkbox` `avatar` `badge` `progress`
  `separator` `skeleton` `sheet` `dialog` `alert-dialog` `tabs` `scroll-area` `tooltip`
  `dropdown-menu` `sonner`. There is no `form` component; the registry replaced it with `field`.
  Form stack is `react-hook-form` + `zod` v4. A 2×2 of selectable cards is a `radio-group`
  wearing different clothes — say whether you would build it that way, because it comes with
  keyboard and a11y semantics for free.
- **No animation library is installed.** Express motion as intent + timing and flag whether it needs
  `motion` (framer-motion) or is achievable in CSS.
- **36 hours, 3 developers.** Anything needing a new dependency must earn it out loud.

## 7. Four problems I already know about — resolve them, do not dodge them

### 7.1 The fold

Four cards in a 2×2 plus a two-line scenario plus a header, at 390×844. If the bottom row sits
below the fold, cards 3 and 4 get systematically fewer selections — **fifteen times, that is
measurement error, not an inconvenience.** Everything must be visible without scrolling, or you
must show me why your alternative does not bias the bottom row. Give real numbers: header height,
scenario height at two lines, card size, gap, safe-area inset, and what is left.

### 7.2 The art direction fights the system

Illustrations are generated as **"flat vector cartoon, warm palette, thick outlines, square 1:1,
bold condensed sans-serif caption centered, high contrast"** — four per block, sixty across the
instrument. That was written for the comedy and it collides on three axes: a warm cartoon palette
against a deliberately colourless neutral base where cyan is the only meaningful accent; warm
reading amber-adjacent, which is the friendship lens hue, on a screen where no lens may appear;
and four saturated cards being loud at rest, which erodes the contrast that makes the selection
glow legible.

**Decide and justify.** Constrain the image style toward the system (desaturated, cyan-keyed,
dark-compatible ground) and re-render; or keep the warm style inside a treatment that subordinates
it at rest and releases it on selection; or keep the images and change the surface around them. If
you change the art direction, **give me the literal replacement style-token string** — it is a
constant in `.claude/workflows/create_quest.js`, and regenerating images is cheap while
re-authoring questions is not.

### 7.3 The caption is baked into the image

The option text is rendered *inside* the PNG. At a 2×2 on 390px each card is roughly 170px wide,
and the longest option is 44 characters of bold condensed sans. That text cannot be selected,
translated, resized by the OS, or read by a screen reader — and **if an image fails to load, the
block becomes unanswerable.**

Rule on it: caption stays inside the image, or images ship caption-free and the option text renders
as real DOM text on the card. State the accessibility and layout consequence of your choice, and if
captions stay baked in, give me the minimum legible cap height at 170px and what that implies for
the caption character budget.

### 7.4 Fifteen identical screens

Repetition is the fatigue risk. Say what varies between blocks — if anything — without breaking the
measurement or implying the traits, and without making the respondent feel the screen has reset.

## 8. The decisions I need from you

1. **Full spec at 390×844** — header, scenario, grid, gaps, card size, radius token, type sizes,
   tap targets, safe-area handling. Real px numbers.
2. **Scenario treatment** — voice, size, how many lines you are budgeting, and whether it persists
   or recedes once choosing starts.
3. **The most+least interaction**, per §4 — affordance, feedback, reversibility, conflict, fallback.
4. **Card states**: rest (all four equal), pressed, marked-most, marked-least, and the *other three*
   once a mark is placed. The cyan glow is your selection language.
5. **Progress across fifteen blocks.** `progress`, a mono counter, both? Someone who does not know
   how much is left quits at block 4. Fifteen is a number worth showing honestly.
6. **Advance.** Auto-advance on block completion, or explicit continue? Auto-advance removes a tap
   ×15 and makes mistakes feel unrecoverable. Pick one, and design the back affordance either way.
7. **Thumb reach.** What sits in the bottom third. The screen must be fully operable one-handed —
   note that the top row of a 2×2 is the *hardest* reach on a 844pt phone.
8. **Header behaviour.** The `hookai` wordmark — lowercase, one word, tight tracking, sometimes a
   cyan dot preceding — and how much vertical space it may take on a screen that repeats fifteen times.
9. **Motion.** Block-to-block transition, and the moment a card is marked. Intent + timing; flag
   whether it needs `motion`.

## 9. States you must cover

This runs live on ~100 phones and then on a stage.

- **Untouched** — block loaded, nothing marked.
- **Half-answered** — one mark placed, one missing.
- **Complete** — both marks placed, ready to advance.
- **Conflict** — same card marked as both most and least.
- **Images loading** — four per block, sixty total. Skeletons, and the card with no image at all.
  **The block must stay answerable with zero images loaded** — which is itself an argument in §7.3.
- **Slow network** — a venue with 100 people on one wifi. Say what you preload and when.
- **Returning respondent** — closed the tab at block 7, came back.
- **Last block** — block 15 must feel like an ending and hand off to the photo + consent step.

## 10. What good output looks like

- **Decisions, not options.** Pick one and justify it. If you present alternatives, rank them and
  name your recommendation. "Either could work" is not useful here.
- **Named tokens, always.** `bg-card`, `text-muted-foreground`, `--primary`. Never a raw hex. New
  tokens are fine — name them, give OKLCH values.
- **A real spec at 390×844** — dimensions, spacing, type sizes, tap targets in px.
- **Buildable in hours by three people with the 23 components listed.** Flag anything needing a new
  dependency and say why it earns its place.
- **Say what to cut.** Subtraction is the more useful contribution now. If something on this screen
  is not earning its place for either completion rate or technical legibility, say so.
