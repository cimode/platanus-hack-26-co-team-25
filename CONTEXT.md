# CONTEXT — Platanus Hack 26 Bogotá / Team 25

> Single source of truth for this project. Read this first in any new session.
> Companion docs: `RESEARCH-COMPATIBILITY.md` (evidence base), `PILLARS.md` (the pillar
> taxonomy, weight vectors and admission criteria — supersedes the research doc where they
> disagree), and `AUDIT.md` (adversarial audit — **read it before pitching any number**).
> Last updated: 2026-08-22

---

## 1. The event

| Item | Value |
|---|---|
| Event | Platanus Hack 26 — Bogotá, Colombia |
| Dates | 21–23 August 2026 |
| Format | 100 hackers, zero to product in 36 hours |
| Track | 🌐 Simulations |
| Team | team-25 — Cristian Moreno (@cimode), Juan Pablo Bautista Cala (@bacaxnot), Robinson Brito (@RABrL) |
| Repo | `platanus-hack-26-co-team-25` |
| Audience | Technical, but human — they respond to emotion, not to architecture diagrams |

### Judging rubric (official)

| Criterion | Weight |
|---|---|
| Aspecto técnico | **25%** |
| Ambición | 20% |
| Ejecución | 20% |
| Impacto | 20% |
| Originalidad | 15% |

**Strategic read:** technical depth is the single heaviest criterion. A chain of LLM
prompts will not score there. The simulation engine needs a defensible model —
explicit state, scored dimensions, deterministic mechanics — with the LLM as a
narrator on top, not as the whole system.

### Explicit constraints from organizers / mentor

- **Product mindset, not business mindset.** Do not build a monetization story,
  a market-size slide, or a go-to-market. Nobody is scoring that.
- **Work backwards from the demo.** Design the moment on stage first, then build
  only the technology that moment requires. This is a mentor recommendation with
  many hackathons behind it, and it is our operating rule.
- **36 hours total.** Agentic/AI-assisted development is assumed, so ambition can
  be higher than a normal 3-person 36h build — but wall-clock is still wall-clock.

---

## 2. The problem

Loneliness as a species-level condition in 2026. Post-pandemic isolation plus a
fully digital social layer has produced a population that is constantly connected
and rarely met. It is a primary driver behind depression, anxiety, and suicidal
behavior.

The specific failure we attack: **people who would matter to each other are
already in the same room, and never find out.** Conferences, hackathons,
restaurants, coworkings — dozens of high-compatibility pairs stand meters apart
for hours and leave as strangers.

We are not building another dating app. We are building the thing that closes the
gap between *being in the same room* and *actually meeting*.

---

## 3. The product

**A simulation engine for human relationships.**

Given a room of real people, the system models each person as an avatar with a
personality, then simulates what a shared life between any two of them would
actually look like — and uses that simulation as the reason to go meet in person.

### Core loop

1. **Intake** — each person in the room fills a form: personality signal + a real photo.
2. **Avatar** — the system builds a structured personality profile per person.
3. **Context selection** — the user picks the lens for the simulation:
   - 💼 **Business** — partnership / cofounder compatibility
   - ❤️ **Romantic** — romantic compatibility
   - 🤝 **Friendship** — friendship compatibility
4. **Ranking** — the engine scores the selected person against every other person
   in the room *under that lens*, and returns the room ranked by compatibility.
5. **Life simulation** — the user picks someone from the ranking, and the engine
   simulates a shared life with them: a timeline of **canonical events** across
   years, derived from both personality profiles.
6. **Offspring** *(romantic lens)* — an image model generates the face of their
   child by merging both real faces. Comedy and shareability peak here.
7. **Meet** *(stretch)* — a call-to-action to meet in real life: request → accept →
   live location sharing inside the venue → they actually find each other.

### What "canonical event" means

A simulated life is not free-form fiction. It is a sequence of discrete,
personality-derived life events on a timeline — *"year 2: you move to Manhattan"*,
*"year 4: you buy the apartment on Fifth Avenue"*, *"year 6: the kid"* — where
each event must be **coherent and congruent** with both personality profiles and
with the events before it. Coherence is the product. A timeline that contradicts
itself kills the illusion instantly.

### Reference feel

A life-sim game (Sims / life-timeline aesthetic), not a chat interface and not a
dating-profile card. The user should feel like they are watching a life play out,
not reading an LLM's opinion.

---

## 4. Demo design (working backwards)

### Intake — decided

**Attendees fill the form today**, before the pitch. QR distributed to hackathon
participants hours ahead. Real names, real photos, real people in the room.
This is what makes the demo land: the audience recognizes the faces on screen.

**Consequence:** form distribution is a *hard, time-boxed dependency*, not a
feature. If the form is not out early with enough responses, the demo has no
substrate. Treat it as the first deliverable, ahead of any UI polish.

### Climax — decided

Two-beat ending:

1. **First: life timeline + AI baby.** Run one chosen pair end to end on screen —
   the years, the canonical events, and then the child's face. This is the
   emotional and comedic peak, and it is reproducible under stage conditions.
2. **Then: match reveal on the room.** Pull back to the whole room ranked and
   connected — the social graph of who in this venue should have met whom.
   This is where the *impact* argument lands: "all of this was in the room the
   whole time, and none of you knew."

### Surface — decided

**Mobile web PWA.** Phones are the device in a venue — camera for the photo,
geolocation for the meet loop, notifications for the request. Mobile-first
throughout. The projector shows a room view during the pitch.

---

## 5. Scope

### Must-have (non-negotiable for the demo)

- [ ] Personality intake form + real photo, mobile-friendly, QR-distributed
- [ ] Avatar / structured personality profile per person
- [ ] Compatibility **ranking** of the room under a selected context (romantic / business / friendship)
- [ ] **Simulated life timeline** with coherent canonical events for a chosen pair
- [ ] **AI baby face** from the two real photos

### Stretch (build only if the must-haves are locked)

- [ ] Meet CTA → request → accept → live location sharing in the venue
- [ ] Push notifications
- [ ] Room-wide match graph as an interactive projected view

### Explicitly out of scope

- Business model, pricing, market sizing — organizers told us to drop this
- Auth beyond the minimum needed to identify a participant
- Anything that does not appear on stage

---

## 6. Rubric mapping

| Criterion | How we score |
|---|---|
| **Aspecto técnico (25%)** | The engine: structured personality model, scored multi-dimensional compatibility per context, state-carrying timeline generation with coherence constraints, face-merge image generation. Must be explainable as a *system*, not as a prompt. |
| **Ambición (20%)** | Simulating an entire shared human life, for every pair in a live room, in 36h. |
| **Ejecución (20%)** | It runs live, on real people in the room, with their real faces. No mocks on stage. |
| **Impacto (20%)** | Loneliness. The demo ends by showing the audience how many connections were sitting unclaimed in their own room. |
| **Originalidad (15%)** | Simulation as a *reason to meet* — not matchmaking, not a dating app, not a chatbot. |

---

## 7. Open questions

These are unresolved and should be answered before or during build. Do not
silently assume.

1. ~~**Personality framework**~~ — **RESOLVED (updated post-audit).** Four measured
   latents — Regulation, Politeness, Reliability, Agency — plus six zero-block pillars
   (declared facts, observed room structure, governance). Fixed 15-block
   desirability-matched forced-choice form with **mixed keying**, scored by Bayesian MAP
   under a Thurstonian choice model with authored (uncalibrated) parameters. See
   `PILLARS.md` §2–§3 and `AUDIT.md`.
2. **Form length** — every extra question costs completion rate, and completion
   rate *is* the demo. What is the minimum viable signal?
3. **Consent and safety** — real people are being publicly ranked by romantic
   compatibility, with their photos, in front of 100 peers. Needs a deliberate
   design: per-context opt-in at intake, rankings visible only to the person who
   ran them, and only *mutual* matches surfaced publicly. Flagging this now
   because it is both an ethical requirement and a live risk of the demo going
   badly on stage.
4. **Generation latency** — a full timeline plus image generation takes real
   seconds. Live-generate on stage (impressive, risky), pre-warm the hero pair,
   or cache aggressively? Affects the pitch script.
5. **Coherence enforcement** — what actually guarantees the timeline does not
   contradict itself? Constrained state passed forward, a validation pass, or
   a deterministic event graph the LLM only narrates?
6. ~~**Product name**~~ — **RESOLVED.** `dipia`, always lowercase. Deployed at https://www.dipia.lat. The old name `hookai` is gone from the repo, including the session cookie (now `dipia_session`). It survives only where it names live infrastructure outside this repo: the `HOOKAI_ROOM_SLUG` environment variable set in Vercel (and the optional `HOOKAI_QUIZ_MOST_LEAST` switch), and the Neon and Vercel project names.

---

## 8. Submission checklist (from the repo README)

- [x] `platanus-hack-project.jsonc` — name, one-liner (Spanish), description (Spanish), deploy URL
- [x] `project-description.md` — replace with the real project description
- [x] `project-logo.png` — 1000x1000, max 500kb
- [ ] README — concise and to the point
- [ ] Deploy: mirror to a personal repo (org repo cannot be connected to Vercel)
