/**
 * single-pick.ts — the one place the elicitation fallback is read (issue #9).
 *
 * `PILLARS.md` §8 puts single-pick first in the cut order: if completion
 * suffers, "Menos yo" is the mark that goes, and the 2×2 degrades with no
 * redesign. The flag is server-side ONLY — `page.tsx` renders one-mark mode
 * with it and `actions.ts` decides with it whether `leastKey` is required.
 *
 * It deliberately never travels in the form. A field the client sends is a
 * field the client can flip, and a participant who could set `singlePick=1`
 * from a phone would waive half the measurement of every block they answer.
 */
export function isSinglePick(): boolean {
  return process.env.HOOKAI_QUIZ_SINGLE_PICK === "1";
}
