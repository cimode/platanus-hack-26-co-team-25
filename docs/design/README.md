# docs/design — Claude Design handoff package

Everything needed to iterate on the hookai design system in an external tool and bring the
result back.

## Files

| File                     | What it is                                                                                                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CLAUDE_DESIGN_BRIEF.md` | **The prompt.** Paste from the `# THE PROMPT` heading down. Everything above it is orientation for the person running the handoff.                                                    |
| `design-tokens.json`     | Machine-readable token mirror — exact OKLCH values, the lens mechanism, component inventory, and the rules that must hold. Attach this so the model never re-derives a colour by eye. |
| `screenshots/`           | The system as actually rendered, 2× DPI, straight from `/design`. Nothing mocked.                                                                                                     |

## Screenshots

| File                      | Shows                                                                                     |
| ------------------------- | ----------------------------------------------------------------------------------------- |
| `00-overview-desktop.png` | Whole system, one image (1280 wide)                                                       |
| `00-masthead.png`         | Wordmark + the serif at display size                                                      |
| `01-brand.png`            | Wordmark treatments, brand cyan swatches                                                  |
| `02-typography.png`       | The three voices and their roles                                                          |
| `03-surfaces.png`         | Neutral surface ramp                                                                      |
| `04-lenses.png`           | **The lens mechanism** — same card, three times, one class changed                        |
| `05-shape-glow.png`       | Radius scale, resting vs active glow per lens                                             |
| `06-controls.png`         | Buttons, badges, intake fields at mobile sizes                                            |
| `07-in-situ.png`          | **Ranking + timeline** — the two real screens, and the type pairing the system exists for |
| `07b-in-situ-mobile.png`  | Same, at 390px                                                                            |
| `08-loading.png`          | Skeleton and progress states                                                              |
| `99-overview-mobile.png`  | Full page at 390×844, the actual target device                                            |

## Regenerating the screenshots

They are captured from the live `/design` route, so they go stale whenever tokens change.

```bash
pnpm run dev                           # in the repo root
pnpm exec playwright install chromium  # once
```

Then drive Playwright against `http://localhost:3000/design`: full page at 1280×1200 and
390×844 with `deviceScaleFactor: 2`, plus per-section crops via
`main > div > section` and `.nth(i)`. Wait on `document.fonts.ready` before shooting or the
serif will not have loaded.

## Source of truth

`src/app/globals.css` is authoritative. `design-tokens.json` is a mirror for design tools —
**if the two disagree, the CSS is right and the JSON is stale.**

## Bringing changes back

Two routes:

1. **Manual** — read the design output, apply token changes to `src/app/globals.css`, rebuild
   `/design`, re-screenshot, regenerate this JSON.
2. **`DesignSync`** — Claude Code can push a local component library into a
   `claude.ai/design` design-system project and diff against it one component at a time.
   Useful once there is a real component library beyond the token layer; overkill today.

## Watch out for

`shadcn init` and `shadcn add @shadcn/font-*` both rewrite the font block in `@theme inline`
and reintroduce a **self-referencing custom property** (`--font-x: var(--font-x)`). Because
`@theme inline` emits its variables into `:root`, and `:root` _is_ `<html>`, that collides
with `next/font`'s own definition at equal specificity and the font silently stops loading.
This has happened three times. After running either command, check
`src/app/globals.css` lines ~12-15 and confirm the font families are literal names.
