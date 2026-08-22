# hookai — design brief for Claude Design

> **How to use this file.** Paste everything from _"THE PROMPT"_ down into Claude Design as
> your opening message. Attach `design-tokens.json` and the images in `screenshots/`.
> Everything above THE PROMPT is orientation for whoever is running the handoff, not for
> the model.

**Attach these:**

| File                                  | Why                                                                |
| ------------------------------------- | ------------------------------------------------------------------ |
| `design-tokens.json`                  | Exact token values. Do not let the model re-derive colours by eye. |
| `screenshots/00-overview-desktop.png` | Whole system in one image                                          |
| `screenshots/04-lenses.png`           | The lens accent mechanism, three states side by side               |
| `screenshots/07-in-situ.png`          | Ranking + timeline, the two real screens                           |
| `screenshots/06-controls.png`         | Form controls at mobile sizes                                      |
| `screenshots/99-overview-mobile.png`  | 390×844, the actual target device                                  |

---

# THE PROMPT

## 1. What you are working on

**hookai** is a simulation engine for human relationships, built for a 36-hour hackathon
(Platanus Hack 26, Bogotá — Simulations track). It is not a dating app and not a chatbot.

The problem it attacks: **people who would matter to each other are already in the same
room and never find out.** Conferences, hackathons, coworkings — dozens of
high-compatibility pairs stand meters apart for hours and leave as strangers.

The product loop:

1. **Intake** — everyone in the room fills a mobile form: personality signal + a real photo.
2. **Avatar** — the system builds a structured personality profile per person.
3. **Lens** — the user picks the frame for the simulation: 💼 business, ❤️ romantic, 🤝 friendship.
4. **Ranking** — the engine scores you against every other person in the room _under that lens_.
5. **Life simulation** — pick someone; the engine simulates a shared life as a timeline of
   _canonical events_ across years, each one derived from both personality profiles and
   coherent with every event before it.
6. **Offspring** (romantic lens only) — an image model merges both real faces into their child's.
7. **Meet** (stretch) — request → accept → live location sharing inside the venue.

A "canonical event" is not free-form fiction. It is a discrete, personality-derived event on
a timeline — _"year 2: you move to Manhattan"_, _"year 6: the kid"_ — that must stay
congruent with both profiles and with prior events. **Coherence is the product.** A timeline
that contradicts itself kills the illusion instantly.

**Reference feel:** a life-sim game (Sims / life-timeline aesthetic). Not a chat interface,
not a dating-profile card. The user should feel like they are _watching a life play out_, not
reading an LLM's opinion.

## 2. The moment this all exists for

Everything is designed backwards from one moment on a stage, in front of ~100 technical
people who filled the form hours earlier and will recognise the faces on screen.

Two beats, in this order:

1. **Life timeline + AI baby.** One chosen pair, run end to end on the projector — the years,
   the canonical events, then the child's face. Emotional and comedic peak.
2. **Match reveal on the room.** Pull back to the entire room ranked and connected — the
   social graph of who in this venue should have met whom. The line that lands is _"all of
   this was in the room the whole time, and none of you knew."_

Judging weights, which shape priorities: **technical depth 25%**, ambition 20%, execution
20%, impact 20%, originality 15%. Technical depth is the heaviest single criterion, and the
design has to make the engine _visible_ — a chain of LLM prompts does not score there. That
is why the type system separates "the engine reporting" from "the life being narrated" (see
§4). Keep making the machinery legible.

## 3. Hard constraints — these are not negotiable

- **Dark only.** Light mode is not built and will not be built. Do not propose a theme toggle.
- **Mobile-web PWA first.** The phone is the device in a venue: camera for the photo,
  geolocation for the meet loop. Target viewport **390×844**. Desktop is secondary except
  for the projected room view.
- **Stack is fixed:** Next.js 16 App Router, React 19, Tailwind CSS v4 (CSS-first `@theme`,
  no config file), shadcn/ui on **Radix** primitives, `radix-nova` style, `lucide` icons.
  Every colour is an OKLCH CSS custom property.
- **Tokens are the only styling source.** No raw hex, no arbitrary spacing, no one-off radius
  anywhere in a component. If a surface needs a colour that is not a token, the design is
  wrong — propose a new token instead.
- **36 hours, 3 developers.** Prefer designs that reuse the 23 components already installed
  over designs that need new primitives. Anything requiring a new dependency must earn it
  explicitly.
- **No animation library is installed yet.** You may specify motion, but express it as
  intent + timing, and flag whether it needs `motion` (framer-motion) or is achievable with
  CSS. Do not assume a library exists.

## 4. The system as it stands

Full values are in the attached `design-tokens.json`. The summary:

### Brand

`hookai` — always lowercase, one word, tight tracking. **The wordmark is the logo**; there
is no separate mark. A cyan dot sometimes precedes it.

### Colour architecture — this is the core idea, understand it before changing anything

There is a **pure neutral base**, deliberately colourless. All colour in the product is
meaningful:

- `--brand` is cyan `oklch(0.72 0.15 200)`. It means _hookai itself_ — the engine. It
  appears on pre-lens surfaces (intake, loading, the shell) and **never follows a lens**.
- `--primary` **defaults to the same cyan**, and each lens class overrides it. So `primary`
  always means _"the accent of the current context"_: cyan before a lens is chosen, the lens
  hue inside one.

The three lenses are plain CSS classes:

| Class              | `--primary`                        | Reads as       |
| ------------------ | ---------------------------------- | -------------- |
| `.lens-romantic`   | rose `oklch(0.645 0.246 16.439)`   | ❤️ romantic    |
| `.lens-business`   | violet `oklch(0.606 0.25 292.717)` | 💼 partnership |
| `.lens-friendship` | amber `oklch(0.769 0.188 70.08)`   | 🤝 friendship  |

Put one on **any subtree** and every token inside retakes its temperature. No variant props,
no conditional classNames, no per-lens components. `screenshots/04-lenses.png` is the same
ranking card rendered three times with one class changed. Custom properties resolve from the
nearest declaring ancestor, so this nests correctly.

**Cool brand against warm lenses is deliberate** — the engine never competes with the
emotion.

### Typography — three voices, three jobs

| Token                        | Face                 | Job                                                               |
| ---------------------------- | -------------------- | ----------------------------------------------------------------- |
| `font-narrative`             | Instrument Serif 400 | **A life being told.** Canonical events, display headlines.       |
| `font-sans` / `font-heading` | Geist                | The interface. Body, labels, nav, **and all card/dialog titles.** |
| `font-mono`                  | Geist Mono           | **The engine reporting.** Scores, years, dimension values, IDs.   |

Never swap these roles. The serif is deliberately **rare** — roughly three appearances per
screen — so that a timeline event reads as _special_. `font-heading` is Geist, not the serif,
precisely so card titles stay furniture. In `screenshots/07-in-situ.png`: "A shared life with
Ana R." is Geist; "You move to Manhattan" is the serif; `O 0.82  C 0.44` is the mono. That
three-way split is the single most important visual idea in the product — a story with the
engine's evidence sitting underneath it.

### Shape and state

- `--radius: 1rem`. Hairline borders. **Flat at rest** — no ambient shadow, no ambient glow.
- `.glow` / `.glow-brand` / `.glow-sm` are for **active / selected / focused surfaces only**.
- `.glow` reads from `--primary`, so it inherits the lens automatically — rose inside
  `.lens-romantic`, violet inside `.lens-business`.
- Everything at rest staying flat is _what makes the glow mean something_. Ambient glow
  means nothing. Hold this line.

### Components available

23 shadcn components are installed and themed: `button` `card` `input` `label` `textarea`
`field` `select` `radio-group` `slider` `checkbox` `avatar` `badge` `progress` `separator`
`skeleton` `sheet` `dialog` `alert-dialog` `tabs` `scroll-area` `tooltip` `dropdown-menu`
`sonner`. Form stack is `react-hook-form` + `zod` v4. There is no `form` component — the
current shadcn registry replaced it with `field`.

## 5. What I want from you

Ranked. Work top-down; depth on 1–3 beats breadth across all of them.

### Priority 1 — the room graph (does not exist, and it is the pitch climax)

Beat 2 of the stage moment has no design at all. Design the **projected room view**: ~24–40
real people as nodes, compatibility as edges, under a selected lens.

It has to survive conditions most data viz never faces:

- Projected in a **lit venue**, read from the back of a room, in about 20 seconds.
- Dark background — which is exactly where projector contrast is weakest. This is the known
  risk of the dark-only decision. Solve it rather than ignore it: consider a higher-contrast
  "stage" treatment of the same tokens.
- It must land the line _"all of this was in the room the whole time."_ Legibility of the
  **overall shape** matters more than any individual node.
- Real names and real faces of people in the audience.
- Only **mutual** high matches should be publicly visible (see §6 on consent).

Give me: layout approach, node and edge treatment, how the lens accent is used, how density
is handled at 40 people, the reveal choreography, and a fallback if the graph is illegible.

### Priority 2 — the AI baby reveal

The comedic and emotional peak. Two real photos merge into a generated child's face.
Design the reveal: framing and aspect, how the image _resolves_ rather than just appearing,
what surrounds it (caption? parents' faces? year?), the share affordance, and the loading
state given image generation takes real seconds. Currently there is nothing.

### Priority 3 — timeline choreography

The timeline exists statically (`screenshots/07-in-situ.png`) but has no motion, and this is
where the audience either leans in or checks out. Specify: what lands first, stagger timing,
whether years arrive one-by-one or as a block, how the serif enters, how the mono evidence
relates in time to the event above it, and where the eye should be when the baby appears.
Express as intent + timing; flag if it needs `motion`.

### Priority 4 — intake flow

`CONTEXT.md` calls form distribution a _hard, time-boxed dependency_ — **completion rate
literally is the demo.** If the form does not get filled, there is no substrate on stage.
Design the multi-step mobile flow: how many steps, what carries progress, the photo capture
step (camera vs upload), per-lens consent, and the minimum viable number of questions.
Optimise ruthlessly for completion on a phone by someone who has 90 seconds and is at a
hackathon. Section 06 of the screenshot shows the current raw controls — that is a token
demo, not a designed flow.

### Priority 5 — lens selection

The moment the user picks romantic / business / friendship. It is the hinge of the whole
product and the only place all three accents can legitimately appear together. Currently
undesigned. Make it feel like choosing a frame for reality.

### Priority 6 — the latency problem

Generation takes real seconds and this is an **unresolved open question** in the project.
Design loading as a _designed moment_, not a spinner: the engine visibly working, ideally
narrating what it is doing (`building canonical events · 64%`). Bonus if the loading state
itself sells technical depth to the judges.

## 6. Constraints you must design around, not away

**Consent and safety.** Real people are being publicly ranked by _romantic_ compatibility,
with their photos, in front of 100 peers. This is both an ethical requirement and a live risk
of the demo going badly on stage. The intended shape: per-lens opt-in at intake, rankings
visible **only to the person who ran them**, and only **mutual** matches surfaced publicly.
Your designs must make this legible rather than hide it — a visible consent state is part of
the product, not fine print.

**Projector vs phone.** The same design system serves a 390px phone and a projected wall.
Dark-first was chosen knowing projected dark loses contrast in a lit room. A "stage mode"
built from the same tokens is welcome.

## 7. Do not change these

Changing any of these costs more than it is worth at this point:

- The name and wordmark treatment: `hookai`, lowercase, one word.
- Dark-only. No light theme, no toggle.
- The three-voice type system and the exact role split in §4.
- The lens mechanism: a CSS class overriding `--primary`. Do not replace it with variant
  props or per-lens components.
- `--brand` cyan as the engine colour, cool against warm lenses.
- Glow reserved for active state. Not ambient.
- Tailwind v4 + shadcn/Radix + `radix-nova`. No new UI framework.
- OKLCH for every colour value.

## 8. Two things I already suspect are wrong

Confirm or reject with reasoning; do not just agree:

1. **The cyan leans green.** `oklch(0.72 0.15 200)` reads slightly "pool water" rather than
   "instrument". Something like `oklch(0.71 0.13 210)` is cooler and bluer. Your call.
2. **The radius scale is very wide.** With `--radius: 1rem`, `sm` is 0.6rem and `2xl` is
   2.2rem, so small elements read nearly square next to large ones that read nearly circular.
   See the radius row in `screenshots/00-overview-desktop.png`.

## 9. What good output looks like

- **Decisions, not options.** Pick one and justify it. If you must present alternatives, rank
  them and name your recommendation. "Either could work" is not useful here.
- **Named tokens, always.** `bg-card`, `text-muted-foreground`, `--primary`. Never a raw hex.
  New tokens are fine — name them and give OKLCH values.
- **Mobile spec at 390×844**, plus the projected variant where relevant.
- **State coverage.** Empty, loading, error, and the too-few-people case. These are not
  afterthoughts in a live demo; they are what the audience actually sees when something
  goes wrong on stage.
- **Buildable in hours, by three people, with the 23 components listed.** Flag anything that
  needs a new dependency and say why it earns its place.
- **Say what to cut.** If something in the current system is not carrying its weight, say so.
  Additions are cheap to propose and expensive to build; subtraction is the more useful
  contribution.
