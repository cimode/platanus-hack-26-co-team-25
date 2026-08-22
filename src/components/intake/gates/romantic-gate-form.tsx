"use client";

import { useActionState, useId, useState } from "react";
import { type GateState, romanticGateAction } from "@/app/intake/gates/actions";
import { StepHeading } from "@/components/intake/step-heading";
import { Button } from "@/components/ui/button";
import type { Gender } from "@/lib/domain/participant";

/**
 * The romantic gate (step 5, issue #8).
 *
 * Rendered ONLY for a participant whose `consent_romantic` is true: asking is
 * itself a disclosure event (PILLARS.md A8), so the page refuses before this
 * component exists and `submitRomanticGate` refuses again for anyone who posts
 * to the action by hand (docs/domain.md §5, D5).
 *
 * Gates are hard filters, not scores -- five answers, no free text. Nothing is
 * prefilled: the ParticipantRepository port has no gate read (docs/domain.md
 * §7), and inventing one so a re-answer could show its old value would widen
 * the port for a screen a participant reaches once.
 */
const RADIO_CLASS = [
  "size-5 shrink-0 appearance-none rounded-full",
  "border-2 border-border bg-card transition-colors",
  "checked:border-primary checked:bg-primary",
  "focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2",
].join(" ");

const CHECKBOX_CLASS = [
  "size-5 shrink-0 appearance-none rounded-md",
  "border-2 border-border bg-card transition-colors",
  "checked:border-primary checked:bg-primary",
  "focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2",
].join(" ");

const CARD_CLASS = "rounded-2xl border border-border bg-card p-4";
const OPTION_CLASS =
  "flex items-center gap-3 rounded-xl border border-border bg-surface-alt px-3 py-2.5 text-sm font-medium text-ink";

const GENDERS: ReadonlyArray<{ value: Gender; own: string; other: string }> = [
  { value: "M", own: "Man", other: "Men" },
  { value: "F", own: "Woman", other: "Women" },
  { value: "NB", own: "Non-binary", other: "Non-binary people" },
];

/** 0..3; the engine compares bands, never birthdays (docs/domain.md §3). */
const AGE_BANDS = ["18–24", "25–31", "32–40", "41 and up"] as const;

const INITIAL: GateState = {};

/**
 * What has been answered so far. It reaches the inputs as `defaultChecked`
 * rather than `checked` because React resets the form once the Server Action
 * resolves, and a reset restores each input to its `checked` ATTRIBUTE -- so an
 * action that comes back with "Pick one for each." leaves the answers that were
 * right exactly where they were.
 */
interface Answers {
  gender: Gender | null;
  interestedIn: Gender[];
  single: boolean;
  ageBand: number | null;
  wantsKids: boolean;
}

const NOTHING_ANSWERED: Answers = {
  gender: null,
  interestedIn: [],
  single: false,
  ageBand: null,
  wantsKids: false,
};

export function RomanticGateForm() {
  const [state, formAction, pending] = useActionState(
    romanticGateAction,
    INITIAL
  );
  const [answers, setAnswers] = useState<Answers>(NOTHING_ANSWERED);
  const genderLabel = useId();
  const ageLabel = useId();

  const toggleInterest = (gender: Gender) =>
    setAnswers((current) => ({
      ...current,
      interestedIn: current.interestedIn.includes(gender)
        ? current.interestedIn.filter((g) => g !== gender)
        : [...current.interestedIn, gender],
    }));

  return (
    <form action={formAction} className="flex flex-1 flex-col gap-4">
      <StepHeading
        step={5}
        title="Romantic — the hard filters, nothing else."
      />

      <section className={CARD_CLASS}>
        <p
          className="font-display text-base font-bold text-ink"
          id={genderLabel}
        >
          Gender
        </p>
        <div
          aria-labelledby={genderLabel}
          className="mt-3 flex flex-col gap-2"
          role="radiogroup"
        >
          {GENDERS.map((option) => (
            <label className={OPTION_CLASS} key={option.value}>
              <input
                className={RADIO_CLASS}
                defaultChecked={answers.gender === option.value}
                name="gender"
                onChange={() =>
                  setAnswers((current) => ({
                    ...current,
                    gender: option.value,
                  }))
                }
                type="radio"
                value={option.value}
              />
              <span>{option.own}</span>
            </label>
          ))}
        </div>
      </section>

      {/* A fieldset -- role "group" -- because this one is a multi-select: at
          least one, and "all three" is a real answer. */}
      <fieldset className={CARD_CLASS}>
        <legend className="font-display text-base font-bold text-ink">
          Interested in
        </legend>
        <div className="mt-3 flex flex-col gap-2">
          {GENDERS.map((option) => (
            <label className={OPTION_CLASS} key={option.value}>
              <input
                className={CHECKBOX_CLASS}
                defaultChecked={answers.interestedIn.includes(option.value)}
                name="interestedIn"
                onChange={() => toggleInterest(option.value)}
                type="checkbox"
                value={option.value}
              />
              <span>{option.other}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <section className={CARD_CLASS}>
        <label className={OPTION_CLASS}>
          <input
            className={CHECKBOX_CLASS}
            defaultChecked={answers.single}
            name="single"
            onChange={(event) =>
              setAnswers((current) => ({
                ...current,
                single: event.target.checked,
              }))
            }
            type="checkbox"
          />
          <span>Single</span>
        </label>
        <p className="mt-2 text-xs text-ink-muted">
          Leave it off and the romantic ranking treats you as taken.
        </p>
      </section>

      <section className={CARD_CLASS}>
        <p className="font-display text-base font-bold text-ink" id={ageLabel}>
          Age band
        </p>
        <div
          aria-labelledby={ageLabel}
          className="mt-3 flex flex-col gap-2"
          role="radiogroup"
        >
          {AGE_BANDS.map((option, index) => (
            <label className={OPTION_CLASS} key={option}>
              <input
                className={RADIO_CLASS}
                defaultChecked={answers.ageBand === index}
                name="ageBand"
                onChange={() =>
                  setAnswers((current) => ({ ...current, ageBand: index }))
                }
                type="radio"
                value={index}
              />
              <span>{option}</span>
            </label>
          ))}
        </div>
      </section>

      <section className={CARD_CLASS}>
        <label className={OPTION_CLASS}>
          <input
            className={CHECKBOX_CLASS}
            defaultChecked={answers.wantsKids}
            name="wantsKids"
            onChange={(event) =>
              setAnswers((current) => ({
                ...current,
                wantsKids: event.target.checked,
              }))
            }
            type="checkbox"
          />
          <span>Wants kids</span>
        </label>
        <p className="mt-2 text-xs text-ink-muted">
          Whether you want them, not when (AUDIT.md S11).
        </p>
      </section>

      <p
        aria-live="polite"
        className="min-h-5 text-sm font-medium text-destructive"
      >
        {state.error ?? ""}
      </p>

      <Button
        className="mt-auto h-12 w-full rounded-2xl font-display text-base font-bold shadow-toy"
        disabled={pending}
        type="submit"
      >
        Continue
      </Button>
    </form>
  );
}
