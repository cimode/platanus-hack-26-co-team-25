/**
 * single-pick.ts — the one place the elicitation mode is read (issue #9).
 *
 * Single pick is the product default: one tap, one answer, the block advances.
 * `PILLARS.md` §8 framed it as the first cut if completion suffered; the product
 * owner made it the baseline after watching people hesitate over "Menos yo",
 * because completion rate is the demo. The two-mark elicitation survives
 * behind `HOOKAI_QUIZ_MOST_LEAST=1` for a room that wants the extra orderings.
 *
 * The flag is server-side ONLY — `page.tsx` renders one-mark mode with it and
 * `actions.ts` decides with it whether `leastKey` is read at all. It
 * deliberately never travels in the form: a field the client sends is a field
 * the client can flip, and a participant who could switch modes from a phone
 * would change what every block they answer measures.
 */
export function isSinglePick(): boolean {
  return process.env.HOOKAI_QUIZ_MOST_LEAST !== "1";
}
