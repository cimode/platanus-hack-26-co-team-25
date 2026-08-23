# The quiz block — design brief

The screen a participant sees twelve times. **Completion rate is the demo**, and this is
where completion is won or lost.

**Read `CLAUDE_DESIGN_BRIEF.md` first** for the Dipia system. Attach `design-tokens.json`
and `screenshots/` with this.

## What changed since the last version of this brief

Two product decisions rewrote the problem:

- **D14 — there are no option images.** The 2×2 grid was art-directed around four
  illustrated cards with the option text baked into the artwork. All of that is cancelled.
  Cards are **type only**.
- **D16/D21 — every participant gets different questions.** Each person is dealt twelve
  blocks from a committed bank of four hundred, so the copy below is representative, not
  fixed. The *structure* is identical for everyone: 12 positions, four options, one per
  pillar, exactly one written in reverse. Nothing is authored while anyone waits — D21
  deleted live generation and the wait screen it needed.

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
all? Getting this wrong makes the screen feel unfinished twelve times.

**Twelve near-identical screens.** Something must change as the participant advances
without adding taps — and the batch beats that used to break them up are gone with the
generation they paced. The only moment before a block is the opening one. Whatever
carries the participant from 1/12 to 12/12 has to live inside the block itself.

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
5. Progress: visible, and if so how — 3/12, a bar, batch dots, or nothing?
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

---

## 8. As built — "B · Diálogo"

Decided by the product owner from an interactive mock-up, 2026-08-23. The nine
questions of §5, answered in code (`src/components/quiz/`):

1. **The 2×2 is gone.** Four full-width rows, an RPG dialogue menu: a faint `▸`
   cursor in the gutter, the text, `min-h-14`, `border-2 border-border bg-card
   shadow-card rounded-xl`. They centre in whatever height the bubble leaves.
2. **Most** lifts (`-translate-y-0.5 border-primary bg-primary-tint shadow-toy`,
   cursor lit in `text-primary`) and says "Más yo" in mono at the row's end.
   **Least** (most+least mode only) sits pressed (`translate-y-1 shadow-none
   bg-surface-alt border-dashed border-ink-faint`), struck through, cursor `✕`,
   "Menos yo". Both carry a word and a shape; colour is never the only cue.
3. **At rest the four are identical.** Same fill, ring, weight and cursor; the
   shuffle (`shownOrderFor`) means there is no first row either.
4. **The scenario is told by the participant's own avatar** (`scene-stage.tsx`):
   the stored plate (`participants.avatar`, drawn with the emotes library's
   `AvatarSprite` so it is the same body as in the room) stands on the left,
   feet on the baseline of a speech bubble (`bg-card border-2 border-border
   rounded-2xl shadow-card`, a CSS two-triangle tail, no image) that carries a
   mono eyebrow "escena N de 12" and the scenario in Nunito Sans semibold.
   Above 160 characters the text steps down one size; it is never truncated.
5. **Progress:** the flow's one bar (`FlowProgress`, 13 steps: registration +
   12 blocks, `aria-valuenow = 1 + position`) under a header with the mono
   counter "N/12" and, from block 2, the ghost "Atrás" link.
6. **Nothing happens between blocks.** The "Tanda N de 3" beats went with the
   inline generation they covered, and the "Escribiendo tus preguntas…" wait
   screen went with D21 — the twelve blocks are dealt from the committed bank
   and stored at registration, so there is never anything to wait for. Only the
   opening moment survives ("Doce escenas…"), told in the same bubble.
7. **Nothing fills the rows but type**: there is no empty space to fill once a
   row is one line of text with a cursor.
8. **Back** costs one header slot, no layout.
9. **Motion:** the press (down one step, shadow gone — the system's pressed
   pattern) and the sprite, which plays its `celebrate` clip when "Más yo"
   lands. Both stop under `prefers-reduced-motion`.

**Single pick is the default** (`HOOKAI_QUIZ_MOST_LEAST=1` restores two marks).
Each row is `<button type="submit" name="mostKey" value={key}>`, so a tap
answers the block with no JavaScript; hydrated, the island holds the form
~650ms so the press and the reaction read, ignores a second tap, then submits
with that row as the submitter. There is no "Siguiente" in this mode; the hint
reads "Toca la que más se parece a ti". Most+least keeps the hidden inputs and
an explicit "Siguiente ▸" / "Terminar ▸".

Budget at 390×844 with a 220-character scenario and four 8-word options:
header ≈76px, stage ≈240px, rows ≈292px, hint and padding ≈60px — under the
fold with room to spare, and `e2e/quiz.spec.ts` AC-1 asserts it.
