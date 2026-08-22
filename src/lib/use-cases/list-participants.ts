import type { Participant } from "../domain/participants/participant";
import type { ParticipantsPort } from "../ports/participants";

/**
 * Every person available to impersonate.
 *
 * The whole roster is handed to the client in one go and filtered there. At
 * ~100 people that is a few kilobytes, and it buys a combobox that responds to
 * every keystroke without a round trip -- which matters because the demo runs
 * on venue wifi.
 */
export async function listParticipants(deps: {
  roster: ParticipantsPort;
}): Promise<readonly Participant[]> {
  return deps.roster.list();
}

/**
 * Resolve a submitted id back to a real person.
 *
 * A Server Action is a public HTTP endpoint, so the id arriving in the FormData
 * is untrusted input -- never a lookup key you can hand straight onward.
 * Returns `null` for anything not on the roster.
 */
export async function findParticipant(
  id: string,
  deps: { roster: ParticipantsPort }
): Promise<Participant | null> {
  const roster = await deps.roster.list();
  return roster.find((person) => person.id === id) ?? null;
}
