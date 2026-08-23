"use client";

import Link from "next/link";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import { proposeMeetAction } from "@/app/encuentros/actions";
import { MEET_PLACES, MEET_TIMES } from "@/lib/domain/meet/meet";
import type { Ending } from "@/lib/domain/reveal/timeline";
import { cn } from "@/lib/utils";

/**
 * The end of the board, and the only thing on this screen that asks for
 * anything.
 *
 * TWO branches, not three. `Ending` has no `"open"` variant, because friendship
 * never reaches this type at all -- it is a `PairedTimeline` field and the
 * friendship branch structurally lacks it. An `"open"` case here would be
 * handling something unreachable, which reads to the next person as though it
 * can happen.
 *
 * No probability, no percentage, no survival fraction (AUDIT.md S10). The
 * simulation narrates ONE life it played out, not a distribution over lives.
 *
 * THE CTA IS NO LONGER INERT. It was, and its own comment said the copy
 * described "what accepting WOULD do once that flow exists with its own consent
 * story". That flow exists now: the button opens a place and a time, both from
 * closed sets, and posts one request the other person can accept or decline on
 * `/encuentros`. What it does NOT do is share live location, which the old copy
 * promised -- so the copy changed with the behaviour rather than outliving it.
 *
 * A DISCLOSURE WORTH NAMING: sending this tells the other person you saw them
 * in your ranking. That is unavoidable in any meet loop and it is why the ask
 * is explicit, one-per-pair, and why a decline is never announced to anybody.
 */
export function EndingCard({
  ending,
  horizonYears,
  otherId,
  otherName,
}: {
  ending: Ending;
  horizonYears: number;
  otherId: string;
  otherName: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <section
      aria-label="Fin de la simulación"
      className={cn(
        "relative shrink-0 self-center",
        "flex w-[276px] flex-col gap-2 rounded-[20px] p-5",
        "border-2 border-primary/55 bg-card shadow-toy"
      )}
    >
      <p className="font-mono text-[10px] text-ink-faint uppercase tracking-[0.1em]">
        fin de la simulación
      </p>

      <h2 className="font-display font-extrabold text-[19px] text-ink leading-tight">
        ¿Se conocen en persona?
      </h2>

      {ending.outcome === "together" ? (
        <p className="font-display text-[13px] text-ink-muted leading-snug">
          Llegan juntos al año {horizonYears}. Está a unos metros de ti, ahora
          mismo.
        </p>
      ) : (
        <p className="font-display text-[13px] text-ink-muted leading-snug">
          Se separan en el año {ending.year}.
          {ending.epilogue ? ` ${ending.epilogue}` : ""}
        </p>
      )}

      {open ? (
        <ProposeForm
          onCancel={() => setOpen(false)}
          otherId={otherId}
          otherName={otherName}
        />
      ) : (
        <>
          <button
            className={cn(
              "mt-1 w-full rounded-[14px] bg-primary px-5 py-3",
              "font-display font-bold text-[15px] text-primary-foreground shadow-toy",
              "transition-transform hover:-translate-y-px hover:shadow-toy-lg active:translate-y-px",
              "focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2"
            )}
            onClick={() => setOpen(true)}
            type="button"
          >
            Proponer encuentro
          </button>

          <p className="font-mono text-[9px] text-ink-faint leading-snug lowercase">
            eliges lugar y hora · {otherName.split(" ")[0]} decide si acepta
          </p>
        </>
      )}

      <p className="font-mono text-[9px] text-ink-faint lowercase">
        una vida posible con {otherName}, no una predicción
      </p>
    </section>
  );
}

/**
 * The ask itself: two selects and a submit.
 *
 * Both lists are closed sets from the domain, and the use case re-checks the
 * submitted value against them -- a Server Action is reachable without this
 * form ever rendering, so the `<select>` is a convenience and never the
 * control.
 *
 * `otherId` rides in a hidden input because the URL already names that person;
 * WHO IS ASKING is never in the form and comes from the session cookie, which
 * is the same rule every other screen in the flow follows.
 */
function ProposeForm({
  onCancel,
  otherId,
  otherName,
}: {
  onCancel: () => void;
  otherId: string;
  otherName: string;
}) {
  return (
    <form action={proposeMeetAction} className="mt-1 flex flex-col gap-2">
      <input name="otherId" type="hidden" value={otherId} />

      <label className="flex flex-col gap-1">
        <span className="font-mono text-[9.5px] text-ink-faint lowercase">
          dónde
        </span>
        <select
          className={selectClass}
          defaultValue={MEET_PLACES[0].id}
          name="place"
        >
          {MEET_PLACES.map((place) => (
            <option key={place.id} value={place.id}>
              {place.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="font-mono text-[9.5px] text-ink-faint lowercase">
          cuándo
        </span>
        <select
          className={selectClass}
          defaultValue={MEET_TIMES[1].id}
          name="time"
        >
          {MEET_TIMES.map((time) => (
            <option key={time.id} value={time.id}>
              {time.label}
            </option>
          ))}
        </select>
      </label>

      <SubmitRow firstName={otherName.split(" ")[0]} onCancel={onCancel} />
    </form>
  );
}

const selectClass = cn(
  "w-full rounded-[12px] border-2 border-ink-faint/35 bg-background px-3 py-2",
  "font-display font-bold text-[14px] text-ink",
  "focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-1"
);

/**
 * Split out ONLY so `useFormStatus` has a parent form to read -- the hook
 * reports the status of the form above it in the tree, so it cannot live in the
 * component that renders the `<form>`.
 */
function SubmitRow({
  firstName,
  onCancel,
}: {
  firstName: string;
  onCancel: () => void;
}) {
  const { pending } = useFormStatus();

  return (
    <>
      <div className="mt-0.5 flex gap-2">
        <button
          className={cn(
            "flex-1 rounded-[14px] bg-primary px-4 py-2.5",
            "font-display font-bold text-[15px] text-primary-foreground shadow-toy",
            "transition-transform active:translate-y-px",
            "disabled:opacity-60 disabled:shadow-none",
            "focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2"
          )}
          disabled={pending}
          type="submit"
        >
          {pending ? "Enviando…" : "Enviar"}
        </button>

        <button
          className={cn(
            "rounded-[14px] border-2 border-ink-faint/40 px-3 py-2.5",
            "font-display font-bold text-[14px] text-ink-muted",
            "transition-colors hover:border-ink-faint/70 hover:text-ink",
            "disabled:opacity-60",
            "focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2"
          )}
          disabled={pending}
          onClick={onCancel}
          type="button"
        >
          Cancelar
        </button>
      </div>

      <p className="font-mono text-[9px] text-ink-faint leading-snug lowercase">
        se lo mandamos a {firstName}. lo verás en{" "}
        <Link className="underline underline-offset-2" href="/encuentros">
          encuentros
        </Link>
        .
      </p>
    </>
  );
}
