# matching — deterministic compatibility engine

Pure-TypeScript, zero-dependency scoring engine for the room ranking (CONTEXT.md §3, step 4).
Scores any pair under a lens (romantic / business / friendship) with two weight vectors:
`w_rank` (formation — ranks the room) and `w_sim` (quality — feeds the timeline), plus
bands, top-3 drivers, worst-term friction, and safety flags for the narrator UI.

Run the demo (Node >= 22.6):

    node src/lib/domain/matching/demo.ts

Where the numbers come from: weight tables copied cell-by-cell from `PILLARS.md` §3; term
forms from §2 and the §4 inversions; gates, degraded modes, frozen band cutoffs (0.40/0.60),
and the banded-penalty carve-out follow `AUDIT.md` S6/S7/S14/S15 and `PILLARS.md` §8. No term
rewards a difference; Agency is penalty-only; business Agency is default OFF (`agencyOverlay`).
