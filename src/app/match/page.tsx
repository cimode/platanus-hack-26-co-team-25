import { MatchReveal } from "@/components/match/match-reveal";
import { DEMO_PAIR, publicSrc } from "./demo-pair";

/**
 * `/match` — the match reveal (CONTEXT.md §3 step 6, AUDIT.md S17).
 *
 * Two circles slide in from opposite edges, the screen eclipses to black with
 * hearts, and it lifts to reveal three circles: the two matched faces above and
 * the AI-imagined child below. A Server Component that hands the demo pair to
 * the client island; only the animation and the generation call need to live on
 * the wire, so only they do.
 *
 * `maxDuration` is the page's budget, and the reveal's server action (the image
 * merge, measured ~18s) runs inside it — the same 120s the quiz and entry pages
 * use, deliberately under every plan's ceiling.
 */
export const maxDuration = 120;

export default function MatchPage() {
  const [a, b] = DEMO_PAIR;

  return (
    <main className="lens-romantic relative mx-auto flex w-full max-w-md flex-1 overflow-hidden bg-dark">
      <MatchReveal
        parentA={{ src: publicSrc(a), name: a.name }}
        parentB={{ src: publicSrc(b), name: b.name }}
      />
    </main>
  );
}
