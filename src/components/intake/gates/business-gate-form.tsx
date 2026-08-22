"use client";

import { useActionState, useId, useState } from "react";
import { businessGateAction, type GateState } from "@/app/intake/gates/actions";
import { StepHeading } from "@/components/intake/step-heading";
import { Button } from "@/components/ui/button";

/**
 * The business gate (step 5, issue #8).
 *
 * Rendered only under `consent_business`, and `submitBusinessGate` refuses
 * again for a hand-crafted POST (docs/domain.md §5, D5). Three answers: both
 * bands are 0..2 here, not 0..3 (docs/domain.md §3).
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

const RISK_POSTURE = ["Play it safe", "Balanced", "Swing big"] as const;
const EXIT_HORIZON = [
  "Under a year",
  "One to three years",
  "In it for the long haul",
] as const;

const INITIAL: GateState = {};

/**
 * Answered so far, held for the same reason as in `romantic-gate-form.tsx`:
 * React resets the form when the action resolves, and a reset restores the
 * `checked` ATTRIBUTE -- so `defaultChecked` is what survives a refusal.
 */
interface Answers {
  riskPosture: number | null;
  exitHorizon: number | null;
  redlinesOk: boolean;
}

const NOTHING_ANSWERED: Answers = {
  riskPosture: null,
  exitHorizon: null,
  redlinesOk: false,
};

export function BusinessGateForm() {
  const [state, formAction, pending] = useActionState(
    businessGateAction,
    INITIAL
  );
  const [answers, setAnswers] = useState<Answers>(NOTHING_ANSWERED);
  const riskLabel = useId();
  const exitLabel = useId();

  return (
    <form action={formAction} className="flex flex-1 flex-col gap-4">
      <StepHeading step={5} title="Business — how you would build." />

      <section className={CARD_CLASS}>
        <p className="font-display text-base font-bold text-ink" id={riskLabel}>
          Risk posture
        </p>
        <div
          aria-labelledby={riskLabel}
          className="mt-3 flex flex-col gap-2"
          role="radiogroup"
        >
          {RISK_POSTURE.map((option, index) => (
            <label className={OPTION_CLASS} key={option}>
              <input
                className={RADIO_CLASS}
                defaultChecked={answers.riskPosture === index}
                name="riskPosture"
                onChange={() =>
                  setAnswers((current) => ({ ...current, riskPosture: index }))
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
        <p className="font-display text-base font-bold text-ink" id={exitLabel}>
          Exit horizon
        </p>
        <div
          aria-labelledby={exitLabel}
          className="mt-3 flex flex-col gap-2"
          role="radiogroup"
        >
          {EXIT_HORIZON.map((option, index) => (
            <label className={OPTION_CLASS} key={option}>
              <input
                className={RADIO_CLASS}
                defaultChecked={answers.exitHorizon === index}
                name="exitHorizon"
                onChange={() =>
                  setAnswers((current) => ({ ...current, exitHorizon: index }))
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
            defaultChecked={answers.redlinesOk}
            name="redlinesOk"
            onChange={(event) =>
              setAnswers((current) => ({
                ...current,
                redlinesOk: event.target.checked,
              }))
            }
            type="checkbox"
          />
          <span>Redlines ok</span>
        </label>
        <p className="mt-2 text-xs text-ink-muted">
          You are fine naming deal-breakers out loud, early.
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
