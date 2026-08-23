import { redirect } from "next/navigation";
import { requireIntakeParticipant } from "@/app/intake/guards";
import { BANDS, DECLARED_SCREENS } from "@/components/intake/declared/bands";
import {
  DeclaredScreen,
  type Question,
} from "@/components/intake/declared/declared-screen";
import { FLOW_DECLARED_FIRST_STEP } from "@/components/intake/flow-progress";
import { IntakeShell } from "@/components/intake/intake-shell";
import type { DeclaredProfile } from "@/lib/domain/participant";

/**
 * `/intake/declared` -- the three question screens between registration and the
 * quiz (docs/domain.md §0 as amended by D18, §3).
 *
 * A Server Component. It resolves the participant from the cookie, applies the
 * guard and then picks the screen FROM THE ROWS: the first one holding a
 * question nobody has answered yet. There is no progress column and there must
 * never be one -- reopening the tab lands exactly where the data says, and the
 * taps already made come back preselected because they were saved a screen at a
 * time.
 *
 * `declaredAt` is set by `saveDeclared` the moment the sixth answer lands
 * (docs/domain.md §3), so a participant who has it belongs to `/quiz`.
 */
export default async function DeclaredPage(
  props: PageProps<"/intake/declared">
) {
  const me = await requireIntakeParticipant();

  if (me.declaredAt) redirect("/quiz");

  const searchParams = await props.searchParams;
  const requested = firstValue(searchParams.screen);
  const index = screenIndex(requested, me.declared);
  const screen = DECLARED_SCREENS[index];

  // The band keys stay on the server: the island is handed opaque field ids,
  // the question and its options, and nothing else (AC-5, AC-6).
  const questions: Question[] = screen.bands.map((key) => ({
    field: BANDS[key].field,
    question: BANDS[key].question,
    options: BANDS[key].options,
    value: me.declared[key],
  }));

  return (
    <IntakeShell step={FLOW_DECLARED_FIRST_STEP + index}>
      <DeclaredScreen
        previousScreenId={index > 0 ? DECLARED_SCREENS[index - 1].id : null}
        questions={questions}
        savedTags={me.declared.tags}
        screenId={screen.id}
        showTags={screen.tags}
      />
    </IntakeShell>
  );
}

/**
 * `?screen=` when it names a real screen -- that is what Back and the action's
 * own redirect use -- and otherwise the first screen with an unanswered
 * question.
 */
function screenIndex(requested: string | undefined, declared: DeclaredProfile) {
  const asked = DECLARED_SCREENS.findIndex((s) => s.id === requested);
  if (asked >= 0) return asked;

  const unfinished = DECLARED_SCREENS.findIndex((s) =>
    s.bands.some((band) => declared[band] === null)
  );
  return unfinished >= 0 ? unfinished : DECLARED_SCREENS.length - 1;
}

/** `?screen=a&screen=b` is a broken link, not a choice: take the first. */
function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
