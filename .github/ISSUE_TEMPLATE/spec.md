---
name: Spec
about: A buildable unit of work whose acceptance criteria become tests
title: ""
labels: ["status:draft"]
---

Depends on: none

## Context

<!-- Why this exists, and the CONTEXT.md / PILLARS.md / AUDIT.md section it
derives from. Link it. If you cannot say why, it is not ready. -->

## Scope

**In:**
**Out:**

## Files affected

<!-- Every path this issue expects to touch, and why. This is what tells us
whether two issues can run in parallel: a shared path means a merge collision
even when neither declares a dependency on the other. -->

| Path | Why |
| --- | --- |
|  |  |

## Acceptance criteria

<!-- At least one happy, one sad, and one edge. A `safety` entry is required
whenever this touches rankings, photos, or consent.

`id` is the join key: it appears verbatim in the test name, so `grep -rn AC-2`
links issue and test. `file` decides the layer at spec time -- src/**/*.test.ts
for engine logic, e2e/*.spec.ts for anything a participant sees. -->

```yaml
- id: AC-1
  kind: happy          # happy | sad | edge | safety
  file: 
  given: 
  when: 
  then: 
```

## Data

<!-- Schema change? Which Neon branch? Fixtures to record? "None" is valid. -->
