import { redirect } from "next/navigation";
import { requireIntakeParticipant } from "@/app/intake/guards";
import {
  type BandKey,
  DECLARED_SCREENS,
} from "@/components/intake/declared/bands";
import {
  DeclaredScreen,
  type SavedDeclared,
} from "@/components/intake/declared/declared-screen";
import { IntakeShell } from "@/components/intake/intake-shell";
import {
  DECLARED_BAND_KEYS,
  type DeclaredProfile,
} from "@/lib/domain/participant";

/**
 * `/intake/declared` -- step 4, the declared round (docs/domain.md §0, §3).
 *
 * A Server Component. It resolves the participant from the cookie, applies the
 * floor guards and then picks the screen FROM THE ROWS: the first one holding a
 * band nobody has tapped yet. There is no progress column and there must never
 * be one -- reopening the tab lands exactly where the data says, and the taps
 * already made come back preselected because they were saved a screen at a time.
 *
 * `declaredAt` is set by `saveDeclared` the moment the sixth band lands
 * (docs/domain.md §3), so a participant who has it is done here and belongs to
 * step 5.
 */
export default async function DeclaredPage(
  props: PageProps<"/intake/declared">
) {
  const me = await requireIntakeParticipant();

  if (me.declaredAt) redirect("/intake/gates");

  const searchParams = await props.searchParams;
  const requested = firstValue(searchParams.screen);
  const index = screenIndex(requested, me.declared);
  const screen = DECLARED_SCREENS[index];

  const saved: SavedDeclared = {
    bands: savedBands(me.declared),
    tags: me.declared.tags,
  };

  return (
    <IntakeShell>
      <DeclaredScreen
        previousScreenId={index > 0 ? DECLARED_SCREENS[index - 1].id : null}
        saved={saved}
        screen={screen}
      />
    </IntakeShell>
  );
}

/**
 * `?screen=` when it names a real screen -- that is what Back and the action's
 * own redirect use -- and otherwise the first screen with an untapped band.
 */
function screenIndex(requested: string | undefined, declared: DeclaredProfile) {
  const asked = DECLARED_SCREENS.findIndex((s) => s.id === requested);
  if (asked >= 0) return asked;

  const unfinished = DECLARED_SCREENS.findIndex((s) =>
    s.bands.some((band) => declared[band] === null)
  );
  return unfinished >= 0 ? unfinished : DECLARED_SCREENS.length - 1;
}

/** The six bands as the screens hold them: tapped value or null. */
function savedBands(declared: DeclaredProfile): SavedDeclared["bands"] {
  const bands = {} as SavedDeclared["bands"];
  for (const key of DECLARED_BAND_KEYS as readonly BandKey[]) {
    bands[key] = declared[key];
  }
  return bands;
}

/** `?screen=a&screen=b` is a broken link, not a choice: take the first. */
function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
