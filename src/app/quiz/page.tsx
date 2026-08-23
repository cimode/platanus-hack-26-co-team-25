import { redirect } from "next/navigation";
import { after } from "next/server";
import { BatchBeat } from "@/components/quiz/batch-beat";
import { BlockScreen } from "@/components/quiz/block-screen";
import { readSessionToken } from "@/lib/adapters/http/session";
import { serverDeps } from "@/lib/composition";
import { BLOCK_COUNT, BLOCKS_PER_BATCH } from "@/lib/domain/quiz";
import { prefetchQuizBatch } from "@/lib/use-cases/ensure-quiz-batch";
import { quizProgress } from "@/lib/use-cases/quiz-progress";
import { isSinglePick } from "./single-pick";

/**
 * `/quiz` — fifteen forced-choice blocks in three batches (issue #9).
 *
 * A Server Component. It reads the `dipia_session` cookie, calls
 * `quizProgress` with `serverDeps()` and renders whatever the ROWS say: there
 * is no step column and no "current block" anywhere (docs/domain.md §0), so a
 * reload, a second phone or a browser restored from sleep all land on the first
 * unanswered position.
 *
 * Three screens come out of one view:
 *
 *   no session          → /intake
 *   quiz_completed_at   → /results
 *   frontier 1 / 6 / 11 → the beat that opens that batch (unless `?start=1`)
 *   anything else       → the block
 *
 * `?block=N` renders an already-answered block for the back affordance;
 * `quizProgress` clamps it to the frontier, so a pasted `?block=12` is block 8
 * and nobody ever jumps ahead of what they have answered.
 *
 * The D16 roll-forward lives here: rendering the opening moment or a beat for
 * batch N schedules `prefetchQuizBatch(N + 1)` in `after()`, so batch N + 1 is
 * authored (~40-70s) while batch N is answered (~100s). The call is
 * unconditional — `prefetchQuizBatch` never rejects and returns at once for
 * batch 4 — which is why the third beat costs nothing.
 *
 * `InstrumentVersionMismatchError` is deliberately NOT caught: a room created
 * for another structural version of the form is an operator misconfiguration,
 * and rendering a block against the wrong structure would silently corrupt the
 * measurement. It belongs on the error boundary (docs/domain.md D2, §10.1(b)).
 */

/**
 * Server Actions and `after()` take the *page's* budget, not their own. Batch
 * authoring is measured at ~40-70s, so the roll-forward needs headroom well
 * past the default — the same 120s `src/app/page.tsx` uses for the entry
 * prefetch, deliberately under every plan's ceiling (`docs/ci.md`).
 */
export const maxDuration = 120;

export default async function QuizPage(props: PageProps<"/quiz">) {
  const searchParams = await props.searchParams;

  const token = await readSessionToken();
  if (!token) redirect("/intake");

  const deps = serverDeps();
  const view = await quizProgress(
    { sessionToken: token, at: requestedBlock(searchParams.block) },
    deps
  );

  // An unknown token is a stranger, not an error: send them to register.
  if (!view) redirect("/intake");
  if (view.completed || !view.block) redirect("/results");

  // A beat opens a batch. It is skipped when `?block=` asked for a specific
  // block (the back affordance never shows a transition) and when `?start=1`
  // has already dismissed it.
  const dismissed = firstValue(searchParams.start) !== undefined;
  const asked = firstValue(searchParams.block) !== undefined;
  const opensBatch = view.nextPosition % BLOCKS_PER_BATCH === 1;

  if (opensBatch && !dismissed && !asked) {
    // Authored while this batch is answered, not while it is awaited.
    after(() =>
      prefetchQuizBatch(
        { participantId: view.participantId, batch: view.batch + 1 },
        serverDeps()
      )
    );

    return <BatchBeat batch={view.batch} />;
  }

  return (
    <BlockScreen
      // Remount per position: the marks are this block's state, and React
      // would otherwise carry them across a navigation into the next one.
      key={view.nextPosition}
      backTo={
        view.nextPosition > 1 ? `/quiz?block=${view.nextPosition - 1}` : null
      }
      block={view.block}
      initialLeast={view.existing?.leastKey ?? null}
      initialMost={view.existing?.mostKey ?? null}
      // The slot order the answer will be recorded under (D10): the island
      // must lay the cards out in it, or `shown_order` describes a screen
      // nobody saw. `quizProgress` and `answerBlock` both derive it from
      // `shownOrderFor(participantId, position)`, so a resume, a reload and
      // the stored row all agree.
      order={view.shownOrder}
      singlePick={isSinglePick()}
      total={BLOCK_COUNT}
    />
  );
}

/** `?block=3` → 3. Anything unparseable is "no request", not an error. */
function requestedBlock(
  value: string | string[] | undefined
): number | undefined {
  const raw = firstValue(value);
  if (raw === undefined) return undefined;
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) ? parsed : undefined;
}

/** `?block=1&block=2` is a broken link, not a choice: take the first. */
function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
