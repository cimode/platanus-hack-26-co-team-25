/**
 * The meet loop's vocabulary (CONTEXT.md §5 stretch: "Meet CTA → request →
 * accept → live location sharing in the venue").
 *
 * This is the FIRST half of that line and deliberately not the second. Live
 * location inside a venue is the wrong instrument: indoors a phone falls back
 * to Wi-Fi trilateration at 10–50 m, which is wider than the whole hackathon,
 * and the web has no background geolocation at all — iOS Safari stops
 * `watchPosition` the moment the tab is backgrounded. Two dots jittering on top
 * of each other do not help anyone find anyone.
 *
 * A place a human NAMED is exact, costs no permission prompt, no battery and no
 * privacy blast radius. So the request carries a place and a time, both chosen
 * from a fixed list, and the finding-each-other happens the way it does at
 * every conference: you agree on a landmark.
 *
 * Both lists are closed sets rather than free text, and that is a safety
 * property, not a shortcut. A free-text field on a request that is delivered to
 * another participant is an unmoderated message channel between two people who
 * have never met — exactly what `PILLARS.md` A7 cuts everywhere else.
 */

/** Where two people agree to meet. Landmarks, not coordinates. */
export const MEET_PLACES = [
  { id: "entrada", label: "En la entrada" },
  { id: "comida", label: "En la zona de comida" },
  { id: "escenario", label: "Frente al escenario" },
  { id: "mesas", label: "En las mesas del fondo" },
  { id: "cafe", label: "En la máquina de café" },
  { id: "afuera", label: "Afuera, en la puerta" },
] as const;

export type MeetPlaceId = (typeof MEET_PLACES)[number]["id"];

/**
 * When. RELATIVE, never a clock time.
 *
 * A wall-clock time needs a date and a zone to mean anything, and both are
 * ways to be wrong on someone else's phone. "En 10 minutos" needs neither and
 * is what a person actually means when they say it in a venue.
 */
export const MEET_TIMES = [
  { id: "ahora", label: "Ahora mismo" },
  { id: "min10", label: "En 10 minutos" },
  { id: "min30", label: "En 30 minutos" },
  { id: "hora1", label: "En una hora" },
  { id: "break", label: "En el próximo break" },
] as const;

export type MeetTimeId = (typeof MEET_TIMES)[number]["id"];

/** Where a request stands. `declined` is terminal and stays invisible to the sender. */
export type MeetStatus = "pending" | "accepted" | "declined";

export function isMeetPlace(value: unknown): value is MeetPlaceId {
  return MEET_PLACES.some((place) => place.id === value);
}

export function isMeetTime(value: unknown): value is MeetTimeId {
  return MEET_TIMES.some((time) => time.id === value);
}

export function placeLabel(id: MeetPlaceId): string {
  return MEET_PLACES.find((place) => place.id === id)?.label ?? id;
}

export function timeLabel(id: MeetTimeId): string {
  return MEET_TIMES.find((time) => time.id === id)?.label ?? id;
}

/**
 * One request, as either side is allowed to see it.
 *
 * `counterpartName` is the OTHER person's name from the reader's point of view
 * — never both names, because a row is only ever read by one of the two people
 * on it and the reader already knows who they are.
 */
export interface MeetRequestView {
  readonly id: string;
  readonly counterpartId: string;
  readonly counterpartName: string;
  readonly place: MeetPlaceId;
  readonly time: MeetTimeId;
  readonly status: MeetStatus;
  readonly createdAt: Date;
}

/** What `/encuentros` renders: what reached you, and what you sent. */
export interface MeetInbox {
  /** Requests addressed to the viewer that are still `pending`. */
  readonly received: readonly MeetRequestView[];
  /**
   * Requests the viewer SENT, in every status.
   *
   * A declined request is reported to its sender as `declined` and nothing
   * more — no name of who else declined, no count, and no way to tell a
   * decline apart from a request that simply has not been opened yet, because
   * `pending` and `declined` are the two states the sender sees and only the
   * recipient's own action moves between them.
   */
  readonly sent: readonly MeetRequestView[];
}
