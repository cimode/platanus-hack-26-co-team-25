"use client";

import { useActionState } from "react";
import { type RegisterState, registerAction } from "@/app/intake/actions";
import { StepHeading } from "@/components/intake/step-heading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const INITIAL: RegisterState = {};

/**
 * Step 1 -- register.
 *
 * The smallest island that needs to be one: `useActionState` is what turns the
 * server's "Name is required" into visible copy without a navigation, and the
 * page above it stays on the server.
 *
 * Name carries no `required` attribute on purpose. The browser would block the
 * submit and the participant would never see the server's sentence -- and the
 * server has to own that sentence anyway, because a Server Action is reachable
 * without this form.
 */
export function RegisterForm({ roomSlug }: { roomSlug: string }) {
  const [state, formAction, pending] = useActionState(registerAction, INITIAL);

  return (
    <form action={formAction} className="flex flex-1 flex-col gap-8">
      <StepHeading step={1} title="Tell the room who you are." />

      {/* The slug, not an id: the action resolves it against `rooms` itself. */}
      <input name="room" type="hidden" value={roomSlug} />

      <div className="space-y-5">
        <div className="space-y-2">
          <Label className="text-ink" htmlFor="intake-name">
            Name
          </Label>
          <Input
            aria-invalid={state.nameError ? true : undefined}
            autoCapitalize="words"
            autoComplete="name"
            className="h-12 rounded-xl bg-card px-4"
            id="intake-name"
            name="name"
            type="text"
          />
          {/* Name also carries whatever could not be blamed on a field -- an
              unresolvable room -- because it is the first thing on screen. */}
          <FieldError message={state.nameError ?? state.error} />
        </div>

        <div className="space-y-2">
          <Label className="text-ink" htmlFor="intake-team">
            Team
          </Label>
          {/* `maxLength` so a long team name is stopped as it is typed rather
              than after a round trip; the server keeps its own 80 and its own
              sentence, because this attribute does nothing without JavaScript
              turned on -- and nothing at all to a direct POST. */}
          <Input
            aria-invalid={state.teamError ? true : undefined}
            className="h-12 rounded-xl bg-card px-4"
            id="intake-team"
            maxLength={80}
            name="team"
            placeholder="Optional"
            type="text"
          />
          <FieldError message={state.teamError} />
        </div>

        <div className="space-y-2">
          <Label className="text-ink" htmlFor="intake-track">
            Track
          </Label>
          <Input
            aria-invalid={state.trackError ? true : undefined}
            className="h-12 rounded-xl bg-card px-4"
            id="intake-track"
            maxLength={80}
            name="track"
            placeholder="Optional"
            type="text"
          />
          <FieldError message={state.trackError} />
        </div>
      </div>

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

/**
 * One field's error line.
 *
 * Always in the DOM, never conditionally mounted: `aria-live` announces changes
 * to a region that was already there, so a region inserted along with its text
 * is the classic way to ship an error a screen reader never hears. The reserved
 * height also keeps the form from jumping under the thumb on a phone.
 */
function FieldError({ message }: { message?: string }) {
  return (
    <p
      aria-live="polite"
      className="min-h-5 text-sm font-medium text-destructive"
    >
      {message ?? ""}
    </p>
  );
}
