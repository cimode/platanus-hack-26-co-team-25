# The quiz block — design brief

The screen a participant sees fifteen times. **Completion rate is the demo**, and this is
where completion is won or lost.

**Read `CLAUDE_DESIGN_BRIEF.md` first** for the Dipia system. Attach `design-tokens.json`
and `screenshots/` with this.

## What changed since the last version of this brief

Two product decisions rewrote the problem:

- **D14 — there are no option images.** The 2×2 grid was art-directed around four
  illustrated cards with the option text baked into the artwork. All of that is cancelled.
  Cards are **type only**.
- **D16 — every participant gets different questions.** Blocks are authored live by a
  model at entry, so the copy below is representative, not fixed. The *structure* is
  identical for everyone: 15 positions, four options, one per pillar, exactly one written
  in reverse.

Design for copy you have not seen. Option text is capped at 8 words, scenarios at 220
characters, but within those bounds the wording varies per person.

---

# THE PROMPT

## 1. The screen

One scenario, four options, 2×2. Target device **390×844**. Real copy from the product:

```
Tu amigo movió la perilla del horno y el pollo lleva
una hora crudo. Los invitados ya están tocando el timbre.

  ┌─────────────────────────┬─────────────────────────┐
  │ Sigo el plan: pollo     │ Anuncio que la cena está│
  │ tarde, pero pollo       │ oficialmente arruinada  │
  ├─────────────────────────┼─────────────────────────┤
  │ Tomo el mando: pedimos  │ Culpo a la perilla,     │
  │ pizza y listo           │ nunca a mi amigo        │
  └─────────────────────────┴─────────────────────────┘
```

Two more, to show the range of length and tone:

> **Cuidas el gato de un amigo y encuentras tu sillón nuevo hecho tiras. Tu amigo jura que
> el gato nunca hace eso.**
> · Tapo el hueco con un cojín, me río
> · Decido: llamo al tapicero y coordino todo
> · Termino la semana de cuidados igual
> · Le recuerdo cada desastre suyo desde 2019

> **Llegan al camping y descubren que nadie trajo las varillas de la carpa. El suelo quedó
> hecho un barrial.**
> · Me tiro al barro y hago un ángel
> · Ni un te-lo-dije sale de mi boca
> · Reservo un hostal y duermo bajo techo
> · Reparto tareas y armamos refugio con ramas

## 2. The interaction — most *and* least

This is not a single-choice question. The participant marks:

1. the option **most** like them
2. the option **least** like them

Two selection states on one grid of four, and they must be distinguishable **without
relying on colour alone**. Naming both observes five of the six pairwise orderings in a
block instead of three — it is where most of the measurement comes from.

There is a documented fallback to single-pick if completion suffers, so the design should
degrade to one selection cleanly.

## 3. Why this screen is hard

**The cards are mostly empty.** Eight words in a card sized for an illustration. What
fills the space — type scale, weight, a key letter, texture, generous padding, nothing at
all? Getting this wrong makes the screen feel unfinished fifteen times.

**Fifteen near-identical screens.** Something must change as the participant advances
without adding taps. Blocks arrive in three batches of five; between-batch moments are
*transitions*, not waits.

**No option may look like the right answer.** Every option is written to be equally
likeable — that is the measurement working. If the design makes one card look
recommended, primary, or default, it breaks the instrument. **No option gets visual
priority over another until the participant picks it.**

**Order is shuffled per participant.** Never design around a fixed reading order or a
"first card" that carries extra weight.

## 4. What the system gives you

- `shadow-toy` following the lens — the obvious tool for selection
- `shadow-card` / flat for rest
- `--primary-tint` for a quiet fill
- Baloo 2 for the scenario, Nunito Sans for options — or argue for the inverse
- 1rem radius, 8px rhythm, warm cream ground

The quiz has no lens yet — the participant has not chosen one. Coral (`:root`) is the
default accent here.

## 5. Nine decisions I need from you

1. Does the 2×2 grid survive, or do four full-width rows read faster on a phone?
2. How is *most* marked? How is *least*? How do they coexist?
3. What does an unselected card look like — flat, tinted, outlined?
4. Where does the scenario sit, and at what scale relative to the options?
5. Progress: visible, and if so how — 3/15, a bar, batch dots, or nothing?
6. What happens between batches?
7. What fills the empty space in a card?
8. Is there a back affordance, and does it cost layout?
9. Does anything move? A card settling into selection is the one place motion clearly
   earns its keep.

## 6. Do not

- Add per-option imagery. It is cancelled, and the copy is generated per person, so no
  art can be pre-made for it.
- Make any option look like the recommended one.
- Introduce blur into a shadow.
- Add a dark variant.
- Use a colour to distinguish *most* from *least* without a second cue.

## 7. What good output looks like

Mobile frames at 390×844 first. Real Spanish copy from above, and at least one frame with
deliberately long options to prove the layout holds. Show rest, most-selected,
most+least-selected, and a between-batch moment. Name tokens, never invent hex.
