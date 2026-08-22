# COMPARISON — score→timeline three-way bake-off (AUDIT F2)

Same interface (`timeline/shared.ts`), same sample set, seeds 11/22/33. Rendered timelines use seed 11. Narration requested: **mock**. Regenerate: `node --experimental-strip-types timeline/compare.ts` (add `TIMELINE_LIVE=1` for live narration).

## Approaches present

- **approach-a** — loaded
- **approach-b** — loaded
- **approach-c** — loaded

## Sofia × Diego — romantic

Score: band **mid** · rank 0.559 · sim 0.592 · drivers: lifeShape, structural, regulation · friction: **commonGround** · flags: bothHighAgency · degraded pair: **no**

### approach-a (seed 11)

- **Year 1** · _How it starts_ · `milestone/ritual` — Their weeks already fit each other; the first month feels suspiciously easy — Sofia and Diego mark it with a long overdue sushi day.
- **Year 1** · _The shared orbit_ · `ritual/ritual` — A weekly sushi ritual takes over one evening and never gives it back — it starts as a joke and calcifies into the calendar.
- **Year 2** · _A shape that fits_ · `move/home` — They pool their books and rent a small place of their own — Sofia scouts the neighborhood, Diego handles the logistics, and it works.
- **Year 3** · _The shared orbit_ · `trip/travel` — A trip planned entirely around sushi; they come back with an inside joke that survives the decade.
- **Year 3** · _The very small boss_ · `kid/kids` — Their first kid arrives and every priority gets renamed — the household reorganizes around a very small new boss.
- **Year 4** · _A shape that fits_ · `move/relocation` — They trade a small place of their own for a bigger place in the same neighborhood; boxes, a new map pin, and a week of figuring out where the good sushi spot is.
- **Year 5** · _The hard part_ · `conflict/conflict-recovery` — A season arrives where their calendars barely overlap and the silences get long — a rough stretch; both keep showing up anyway.
- **Year 5** · _The hard part_ · `recovery/conflict-recovery` — They institute a no-phones evening and rebuild the overlap on purpose — the repair takes actual work, and it lands.
- **Year 5** · _Two pilots, one cockpit_ · `conflict/work-balance` — Two people used to steering pick the same moment to steer — a rough stretch; both keep showing up anyway.
- **Year 5** · _Two pilots, one cockpit_ · `recovery/work-balance` — They split the map: who navigates what, written down and honored — an honest reset, and the sushi plans resume.
- **Year 5** · _The very small boss_ · `milestone/kids` — The kid's first sushi outing becomes a new family tradition; it quietly becomes the thing they measure other years against.
- **Year 6** · _The turn_ · `dissolution/conflict-recovery` — The shared ground thins until both can name it; the ending is quiet, chosen, and handled like adults.
- **Ending:** wound down in year 6 (horizon 10y)

### approach-b (seed 11)

- **Year 1** · _Making home_ · `move/home` — Sofia and Diego move in together — a small place with good light that instantly feels like theirs; boxes, a new map pin, and a week of figuring out where the good sushi spot is.
- **Year 2** · _The city question_ · `move/relocation` — After months of maps on the table, Diego makes the case and Sofia says yes — they relocate to a bigger city for the work years; the new place is smaller than promised and better than expected.
- **Year 3** · _The kid year_ · `kid/kids` — Their first kid arrives — every schedule bends around the crib; sleep gets rare, the sushi plans go on pause, and neither would trade it.
- **Year 3** · _Two hands on the wheel_ · `conflict/home` — Two strong defaults collide — both plan the trips, both steer the budget, both edit the plan mid-drive; the disagreement is real and neither pretends otherwise.
- **Year 4** · _Making home_ · `ritual/home` — How home should run survives its first impossible scheduling year, which makes it official; miss it once and the week feels off. They stop missing it.
- **Year 4** · _Two hands on the wheel_ · `recovery/home` — They split the map for real: each owns whole territories, and overruling costs the next restaurant pick — the repair takes actual work, and it lands.
- **Year 6** · _Off the map — Out the door_ · `trip/travel` — The climbing trip finally happens — badly planned, perfectly timed — planned around sushi, derailed by weather, rescued by improvisation.
- **Year 7** · _Where it grinds — Common Ground_ · `conflict/ritual` — Their interest maps barely overlap — Sofia's climbing weekends and Diego's startups ones keep running in parallel — they name the problem out loud, which is harder than it sounds.
- **Year 7** · _The city question_ · `ritual/relocation` — The city question survives its first impossible scheduling year, which makes it official; miss it once and the week feels off. They stop missing it.
- **Year 7** · _Off the map — Out the door_ · `trip/travel` — The climbing trip finally happens — badly planned, perfectly timed; they come back with an inside joke that survives the decade.
- **Year 8** · _Where it grinds — Common Ground_ · `recovery/ritual` — They stop trying to merge hobbies and invent one thing that is only theirs — a sushi table, built from scratch — an honest reset, and the sushi plans resume.
- **Ending:** still going at the 8-year horizon

### approach-c (seed 11)

- **Year 1** · _What carries them_ · `milestone/home` — It starts with sushi and a first month that feels easy — Sofia and Diego mark it with a long overdue sushi day.
- **Year 3** · _Where it grinds_ · `conflict/conflict-recovery` — The shrinking overlap in their calendars surfaces for real between Sofia and Diego — they name the problem out loud, which is harder than it sounds.
- **Year 4** · _Where it grinds_ · `recovery/conflict-recovery` — They redesign the week around the gap instead of pretending it is gone — the repair takes actual work, and it lands.
- **Year 5** · _What carries them_ · `kid/kids` — Their first kid arrives — the household reorganizes around a very small new boss.
- **Year 6** · _What carries them_ · `ritual/ritual` — The way their weeks already fit each other becomes a yearly tradition — it starts as a joke and calcifies into the calendar.
- **Year 7** · _What carries them_ · `trip/travel` — A trip planned around sushi — the photos are terrible and the stories are excellent.
- **Ending:** still going at the 8-year horizon

### Structure stats (3 seeds)

| approach | narration | events | arcs | friction arc | kid events | safety hits | validation errors | distinct structures /3 | seed-repeat deterministic |
|---|---|---|---|---|---|---|---|---|---|
| approach-a | mock | 12/11/13 | 7/6/7 | all 3 ✓ | 1/1/1 | 0 | 0 | 3 | yes |
| approach-b | mock | 11/11/13 | 6/6/5 | all 3 ✓ | 1/1/1 | 0 | 0 | 3 | yes |
| approach-c | mock | 6/5/6 | 2/2/2 | all 3 ✓ | 1/0/1 | 0 | 0 | 2 | yes |

## Sofia × Mateo — business

Score: band **high** · rank 0.833 · sim 0.759 · drivers: structural, lifeShape, reliability · friction: **reliability** · flags: bothHighAgency · degraded pair: **no**

### approach-a (seed 11)

- **Year 1** · _Day one_ · `venture/runway` — Sitting one desk apart turns into sketching a company on the same whiteboard; Sofia and Mateo split the work along the seam that was always there.
- **Year 1** · _First yes_ · `client/first-client` — Their fintech venture lands its first paying client after a demo held together with tape; they frame the invoice. Nobody frames the sixteen drafts behind it.
- **Year 2** · _Runway math_ · `milestone/runway` — Their fintech venture closes a small round and the runway stops being a countdown — Sofia and Mateo mark it with a long overdue sushi day.
- **Year 3** · _The machine room_ · `ritual/work-rhythm` — The Monday planning ritual that keeps the machine honest — it starts as a joke and calcifies into the calendar.
- **Year 3** · _First hire_ · `job/hiring` — Their fintech venture makes its first hire; teaching the playbook turns out to be the hard part — the calendars take a month to recover, then find a new rhythm.
- **Year 4** · _The hard part_ · `conflict/runway` — A missed handoff lands in front of a client and cannot be waved off — they name the problem out loud, which is harder than it sounds.
- **Year 4** · _The turn of the wheel_ · `venture/pivot` — Their fintech venture pivots after honest numbers; the new direction feels obvious in hindsight — the whiteboard photo from that night becomes the company origin story.
- **Year 5** · _The hard part_ · `recovery/runway` — They build the checklist ritual that makes handoffs boring again — an honest reset, and the dogs plans resume.
- **Year 5** · _The handshake_ · `exit/exit` — Their fintech venture finds its buyer, and the handshake matches the plan from year one; they close the chapter on the timeline they said they would.
- **Ending:** still going at the 5-year horizon

### approach-b (seed 11)

- **Year 1** · _The build_ · `venture/product` — Sofia and Mateo sketch their fintech venture on a whiteboard after hours and register the name before midnight; Sofia and Mateo split the work along the seam that was always there.
- **Year 2** · _Where it grinds — Reliability_ · `conflict/runway` — A promised deliverable slips twice in one quarter, and the runway spreadsheet notices before anyone says it out loud — they name the problem out loud, which is harder than it sounds.
- **Year 2** · _Operating rhythm_ · `milestone/work-rhythm` — A small start on their operating rhythm — nothing official, just intent and a shared note — Sofia and Mateo mark it with a long overdue sushi day.
- **Year 2** · _Two hands on the wheel_ · `conflict/decision-rights` — Both reach for the wheel on the same pricing call, and neither lets go until the room goes quiet — a rough stretch; both keep showing up anyway.
- **Year 3** · _Where it grinds — Reliability_ · `recovery/runway` — They install a weekly ship-or-say ritual: smaller promises, kept visibly, counted out loud — the repair takes actual work, and it lands.
- **Year 3** · _The build_ · `milestone/product` — What their fintech venture actually is gets real: a standing slot in both calendars, defended weekly; it quietly becomes the thing they measure other years against.
- **Year 3** · _Two hands on the wheel_ · `recovery/decision-rights` — They write the decision map — who calls what, plus a tie-break rule both actually respect — an honest reset, and the sushi plans resume.
- **Year 5** · _The build_ · `milestone/product` — What their fintech venture actually is pays off in a way both of them can point to — small on paper, load-bearing in practice.
- **Year 6** · _Operating rhythm_ · `milestone/work-rhythm` — Their operating rhythm lands somewhere imperfect, and they keep it anyway; it quietly becomes the thing they measure other years against.
- **Year 6** · _The horizon_ · `exit/exit` — An acquirer circles their fintech venture; they set a number and a walk-away line, and shake on revisiting next year — the handshake takes a minute; the paperwork takes a quarter.
- **Ending:** still going at the 6-year horizon

### approach-c (seed 11)

- **Year 1** · _Building it_ · `venture/runway` — They commit to building together — the way their worlds keep overlapping sets the pace; Sofia and Mateo split the work along the seam that was always there.
- **Year 2** · _Building it_ · `client/first-client` — The first client says yes and the tone of every meeting changes; they frame the invoice. Nobody frames the sixteen drafts behind it.
- **Year 3** · _Where it grinds_ · `conflict/work-rhythm` — The space between plans made and plans kept shows up in the week-to-week rhythm — they name the problem out loud, which is harder than it sounds.
- **Year 3** · _Building it_ · `decision/decision-rights` — They write down who decides what before they need it; the tie-break rule is used twice all year, and respected both times.
- **Year 4** · _Where it grinds_ · `recovery/work-rhythm` — They codify the working rhythm so the gap stops costing them mornings; what changes is not the problem but how they schedule around it.
- **Ending:** still going at the 5-year horizon

### Structure stats (3 seeds)

| approach | narration | events | arcs | friction arc | kid events | safety hits | validation errors | distinct structures /3 | seed-repeat deterministic |
|---|---|---|---|---|---|---|---|---|---|
| approach-a | mock | 9/9/9 | 8/8/8 | all 3 ✓ | 0/0/0 | 0 | 0 | 3 | yes |
| approach-b | mock | 10/11/11 | 5/5/4 | all 3 ✓ | 0/0/0 | 0 | 0 | 3 | yes |
| approach-c | mock | 5/5/5 | 2/2/2 | all 3 ✓ | 0/0/0 | 0 | 0 | 2 | yes |

## Sofia × Carla — friendship

Score: band **high** · rank 0.697 · sim 0.788 · drivers: commonGround, lifeShape, structural · friction: **structural** · flags: none · degraded pair: **no**

### approach-a (seed 11)

- **Year 1** · _The standing thing_ · `ritual/ritual` — The scifi ritual: same spot, same order, no invite needed; miss it once and the week feels off. They stop missing it.
- **Year 1** · _The annual menu_ · `vignette/food` — The climbing-adjacent dinner experiment becomes an annual tasting menu of questionable ambition — nobody plans it, everybody remembers it.
- **Year 3** · _The hard part_ · `conflict/distance-texture` — The room that made them disappears, and with it the accidental hangouts — a rough stretch; both keep showing up anyway.
- **Year 3** · _The two-person club_ · `vignette/media` — A two-person indie-music club with strong opinions and no other members; the scifi habit they share does the heavy lifting.
- **Year 4** · _The standing thing_ · `vignette/ritual` — The ritual survives two job changes and a move across town; the dogs habit they share does the heavy lifting.
- **Year 4** · _The hard part_ · `recovery/distance-texture` — They move the friendship to on-purpose: a recurring slot, defended — the repair takes actual work, and it lands.
- **Year 5** · _The long-gap superpower_ · `vignette/distance-texture` — Months of silence, then one text, and the conversation resumes mid-sentence; the scifi habit they share does the heavy lifting.
- **Year 5** · _The joke that shipped_ · `milestone/project` — A tiny climbing side project they ship as a joke and quietly maintain for years — Sofia and Carla mark it with a long overdue scifi day.
- **Ending:** none — friendship timelines are episodic vignettes with no duration claim (PILLARS §6.1)

### approach-b (seed 11)

- **Year 1** · _The obsession_ · `ritual/hobby` — The climbing obsession starts almost by accident and immediately sticks; miss it once and the week feels off. They stop missing it.
- **Year 2** · _The rotation_ · `ritual/food` — Every year since, the sushi rotation starts almost by accident and immediately sticks — the ritual Sofia and Carla defend against every scheduling conflict.
- **Year 2** · _Off the map — Standing ritual_ · `conflict/ritual` — Outside pressure lands on the standing climbing plan harder than either expected — a rough stretch; both keep showing up anyway.
- **Year 3** · _Off the map — Standing ritual_ · `recovery/ritual` — They hold the line on the standing climbing plan, and it holds them up in return; what changes is not the problem but how they schedule around it.
- **Year 4** · _The long quiet_ · `conflict/distance-texture` — Life gets loud and the thread goes quiet for months at a stretch; the disagreement is real and neither pretends otherwise.
- **Year 5** · _The obsession_ · `ritual/hobby` — Every year since, the climbing obsession survives its first impossible scheduling year, which makes it official — the ritual Sofia and Carla defend against every scheduling conflict.
- **Year 5** · _The long quiet_ · `recovery/distance-texture` — Carla sends one message and the months of silence turn out to weigh nothing — with these two, one texter is enough; what changes is not the problem but how they schedule around it.
- **Year 6** · _Where it grinds — Structural Proximity_ · `conflict/reunion` — Their calendars only overlap by accident — no shared team, no shared track — and every hangout takes three reschedules — they name the problem out loud, which is harder than it sounds.
- **Year 7** · _Where it grinds — Structural Proximity_ · `recovery/reunion` — Sofia starts pinning a monthly date nobody is allowed to move; proximity gets manufactured on purpose — an honest reset, and the climbing plans resume.
- **Year 7** · _The rotation_ · `ritual/food` — The sushi rotation survives its first impossible scheduling year, which makes it official; miss it once and the week feels off. They stop missing it.
- **Ending:** none — friendship timelines are episodic vignettes with no duration claim (PILLARS §6.1)

### approach-c (seed 11)

- **Year 1** · _What carries them_ · `vignette/food` — It starts with climbing and scifi and an easy first hangout; the climbing habit they share does the heavy lifting.
- **Year 2** · _What carries them_ · `ritual/ritual` — Every year since, the shared ground they keep returning to turns into a standing plan — the ritual Sofia and Carla defend against every scheduling conflict.
- **Year 4** · _Where it grinds_ · `conflict/distance-texture` — A season tests the absence of rooms that used to throw them together — a rough stretch; both keep showing up anyway.
- **Year 5** · _Where it grinds_ · `recovery/distance-texture` — One of them reaches out first and the thread picks right back up — the repair takes actual work, and it lands.
- **Year 6** · _What carries them_ · `trip/trip` — A short trip built around climbing and scifi; they come back with an inside joke that survives the decade.
- **Ending:** none — friendship timelines are episodic vignettes with no duration claim (PILLARS §6.1)

### Structure stats (3 seeds)

| approach | narration | events | arcs | friction arc | kid events | safety hits | validation errors | distinct structures /3 | seed-repeat deterministic |
|---|---|---|---|---|---|---|---|---|---|
| approach-a | mock | 8/8/6 | 6/6/4 | all 3 ✓ | 0/0/0 | 0 | 0 | 3 | yes |
| approach-b | mock | 10/9/8 | 5/4/4 | all 3 ✓ | 0/0/0 | 0 | 0 | 3 | yes |
| approach-c | mock | 5/5/5 | 2/2/2 | all 3 ✓ | 0/0/0 | 0 | 0 | 2 | yes |

## Sofia × Nina — business (degraded mode)

Score: band **mid** · rank 0.503 · sim 0.541 · drivers: lifeShape, reliability, structural · friction: **structural** · flags: none · degraded pair: **yes**

### approach-a (seed 11)

- **Year 1** · _Day one_ · `venture/runway` — Matched hours and matched appetite — they schedule the founding meeting like a sprint; Sofia and Nina split the work along the seam that was always there.
- **Year 2** · _First yes_ · `client/first-client` — Their scifi-inspired venture lands its first paying client after a demo held together with tape — the first yes changes the tone of every meeting after it.
- **Year 2** · _Runway math_ · `milestone/runway` — Their scifi-inspired venture closes a small round and the runway stops being a countdown — small on paper, load-bearing in practice.
- **Year 2** · _The turn of the wheel_ · `venture/pivot` — Their scifi-inspired venture pivots after honest numbers; the new direction feels obvious in hindsight — the whiteboard photo from that night becomes the company origin story.
- **Year 2** · _The machine room_ · `ritual/work-rhythm` — The Monday planning ritual that keeps the machine honest — it starts as a joke and calcifies into the calendar.
- **Year 2** · _First hire_ · `job/hiring` — Their scifi-inspired venture makes its first hire; teaching the playbook turns out to be the hard part — the calendars take a month to recover, then find a new rhythm.
- **Year 3** · _The hard part_ · `conflict/work-rhythm` — Operating from different rooms makes every small sync expensive — a rough stretch; both keep showing up anyway.
- **Year 4** · _The hard part_ · `recovery/work-rhythm` — They anchor the week with a standing working session; what changes is not the problem but how they schedule around it.
- **Year 5** · _The wind-down_ · `dissolution/exit` — Their scifi-inspired venture has run its course; the ending is quiet, chosen, and handled like adults.
- **Ending:** wound down in year 5 (horizon 8y)

### approach-b (seed 11)

- **Year 1** · _The build_ · `venture/product` — Sofia and Nina sketch their two-person venture on a whiteboard after hours and register the name before midnight; Sofia and Nina split the work along the seam that was always there.
- **Year 2** · _Runway math_ · `milestone/runway` — A small start on the runway plan — nothing official, just intent and a shared note; it quietly becomes the thing they measure other years against.
- **Year 3** · _Off the map — First yes_ · `ritual/first-client` — Landing their two-person venture's first real client starts almost by accident and immediately sticks; miss it once and the week feels off. They stop missing it.
- **Year 4** · _The build_ · `milestone/product` — What their two-person venture actually is gets real: a standing slot in both calendars, defended weekly — small on paper, load-bearing in practice.
- **Year 4** · _Off the map — First yes_ · `ritual/first-client` — Landing their two-person venture's first real client survives its first impossible scheduling year, which makes it official — it starts as a joke and calcifies into the calendar.
- **Year 6** · _Where it grinds — Structural Proximity_ · `conflict/work-rhythm` — They come from different corners of the room — no shared shorthand — and early meetings run long on translation — a rough stretch; both keep showing up anyway.
- **Year 6** · _Where it grinds — Structural Proximity_ · `recovery/work-rhythm` — Two weeks of working side by side builds the shorthand the org chart never gave them — an honest reset, and the scifi plans resume.
- **Year 6** · _The build_ · `milestone/product` — What their two-person venture actually is pays off in a way both of them can point to — small on paper, load-bearing in practice.
- **Year 6** · _Runway math_ · `milestone/runway` — The runway plan pays off in a way both of them can point to; it quietly becomes the thing they measure other years against.
- **Year 6** · _The horizon_ · `exit/exit` — An acquirer circles their two-person venture; they set a number and a walk-away line, and shake on revisiting next year; they close the chapter on the timeline they said they would.
- **Ending:** still going at the 6-year horizon

### approach-c (seed 11)

- **Year 1** · _Building it_ · `venture/runway` — They commit to building together — the way their weeks already fit each other sets the pace; Sofia and Nina split the work along the seam that was always there.
- **Year 2** · _Where it grinds_ · `conflict/work-rhythm` — The absence of rooms that used to throw them together shows up in the week-to-week rhythm; the disagreement is real and neither pretends otherwise.
- **Year 2** · _Building it_ · `client/first-client` — The first client says yes and the tone of every meeting changes; they frame the invoice. Nobody frames the sixteen drafts behind it.
- **Year 3** · _Where it grinds_ · `recovery/work-rhythm` — They codify the working rhythm so the gap stops costing them mornings; what changes is not the problem but how they schedule around it.
- **Year 4** · _Building it_ · `decision/decision-rights` — They write down who decides what before they need it — they write down who decides what, before they need it.
- **Ending:** still going at the 5-year horizon

### Structure stats (3 seeds)

| approach | narration | events | arcs | friction arc | kid events | safety hits | validation errors | distinct structures /3 | seed-repeat deterministic |
|---|---|---|---|---|---|---|---|---|---|
| approach-a | mock | 9/7/9 | 8/6/8 | all 3 ✓ | 0/0/0 | 0 | 0 | 3 | yes |
| approach-b | mock | 10/10/12 | 5/5/6 | all 3 ✓ | 0/0/0 | 0 | 0 | 3 | yes |
| approach-c | mock | 5/5/5 | 2/2/2 | all 3 ✓ | 0/0/0 | 0 | 0 | 2 | yes |

## Verdict

**SHIP APPROACH B** as primary — A retained as the hard fallback when a live call fails,
C's validator kept as the output gate on everything. (Restored from the bake-off run after a
mock regeneration clobbered this section; structural evidence in the sections above: B leads
variety 17 vs 13 distinct kind/domain pairs, all safety and coherence checks clean across 60
generations, cost does not discriminate at demo scale.)

## Live run — zai/glm-4.7-flash, free tier (2026-08-22)

Minimal probe (`timeline/live-probe.ts`): sofia×diego romantic, seed 11, one pass per approach.

| Approach | Wall time | Narration | What happened |
|---|---|---|---|
| A | 207s | **mock** (fell back) | Free-tier rate limit (429) on glm; retry backoff burned ~200s walking the model chain (tier-locked models fail instantly, glm appears twice), then fell back to mock. |
| **B** | **6.6s** | **LIVE** | Ran in the rate-limit window that had reset. Nominate + narrate both live. This is the pipeline working end to end. |
| C | 221s | **mock** (fell back) | Its single large call (~4k tokens in) trips the free tier's token/min cap → same backoff spiral → validator fallback skeleton. |

**Reading the live B output vs mock:** the specificity gap is visible — live narration weaves
the pair's actual tags through every event (climbing gear, indie playlists, sci-fi timelines,
the sushi table) where mock fills templates. Flash-tier prose has awkward joints ("selling
startups and crossfit sessions around long reconnaissance outings"), consistent with this being
the cost-floor model. The quality ceiling (kimi-k2.5, deepseek-v4-pro) remains untested pending
paid credits.

**Why the earlier full live run hung for an hour:** 60 generations × free-tier rate limits ×
a patient retry policy (4 retries, 10–40s linear backoff, per model, glm twice in the chain)
≈ 3+ minutes per throttled generation. Not a code bug — a tier limit colliding with polite
backoff. Paid credits raise the limits and unlock the better models; independently, the
backoff budget should be capped (~30s total) so a throttled call degrades to mock quickly.

**Verdict unchanged, now with live evidence:** B ships. Live narration demonstrably adds the
specificity magic; the model question (flash vs kimi/deepseek) stays open until credits land.

## Model-off (live, 2026-08-22)

One pair (sofia×diego, romantic, seed 11), one pass per approach per model
(`timeline/live-probe.ts`), measured 2026-08-22.

| Model | A | B | C | Notes |
|---|---|---|---|---|
| zai/glm-4.7-flash | mock (fell back) | **6.6s live** | mock (fell back) | Free tier: A/C fell to mock. Prose fast but clunky. |
| moonshotai/kimi-k2.5 | 68.2s live | 116.5s live | 148.0s live | ALL LIVE. Best prose by a clear margin — specific, warm, funny (the "Us vs. Work" fridge note, the sushi table built from scratch). |
| deepseek/deepseek-v4-pro | 59.6s live | 115.3s live | 178.3s live | ALL LIVE. Close second — cleaner but more generic than kimi. |

**Prose verdict:** kimi-k2.5 > deepseek-v4-pro > glm-4.7-flash.

**Locked config:** ship **approach B** (grammar hybrid) as the default generator
(`timeline/index.ts`); narration model chain **moonshotai/kimi-k2.5 →
deepseek/deepseek-v4-pro → zai/glm-4.7-flash → deterministic mock**
(`MODEL_PRIMARY` / `MODEL_FALLBACKS` in `timeline/lib/narrator.ts`).

**Root cause of the ~2-minute timelines — and the batch fix:** narrate() was making ONE
CALL PER BEAT sequentially (~12 calls); a single kimi call answers in ~2.4s — the models
are fast, the loop was slow. The live path now makes **one batch generateObject call per
timeline** (schema `{ sentences: [{ index, text }] }` with exact beat count; person facts
once; safety rules; the full ordered beat list with per-beat established-state facts),
still routed through generateWithFallback (capped backoff + 60s abort). Validation:
exact count, per-sentence banned/survival scan, length cap — one retry, then the
deterministic per-beat mock path.

**Invented-state bug + guard:** live narration invented unestablished state across models
— a dog appeared in A/B prose although no pet event exists (A even contradicted itself:
"a dog-free vacation ... postcards to their pup back home"); C avoided it by creating the
pet via an explicit event. The batch prompt now carries an explicit ESTABLISHED STATE
inventory (locations, kids, pets, jobs derived from the beats — "pets: none" when none)
plus the hard rule that no person, pet, or place may appear unless established, and a
cheap post-check replaces any pet-word sentence with its deterministic mock fallback when
the inventory has no pet (counted in `meta.petGuardReplacements`).
