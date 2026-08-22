# docs/design — Claude Design handoff package

Everything needed to iterate on the **Dipia** design system in an external tool and bring
the result back.

Dipia is warm cream, coral, rounded display type, hard toy shadows and pixel-art sprites
over crisp UI. **Light-only.** It replaced the dark hookai system in commit `d6e0d4d` —
if you find a reference to brand cyan, OKLCH, Instrument Serif or `.glow` anywhere, that
document is stale.

## Files

| File | What it is |
| --- | --- |
| `CLAUDE_DESIGN_BRIEF.md` | **The system prompt.** Paste from the `# THE PROMPT` heading down; everything above it is orientation for whoever runs the handoff. |
| `CLAUDE_DESIGN_QUIZ_BLOCK.md` | **The quiz block prompt** — the one screen a participant sees fifteen times, and the highest-value open problem in the product. |
| `design-tokens.json` | Machine-readable token mirror: exact hex, the lens mechanism, the shadow system, the rules that must hold. Attach it so the model never re-derives a colour by eye. |
| `screenshots/` | The system as actually rendered at 2× DPI, straight from `/design`. Nothing mocked. |
| `sketch-quiz-block.png` | The original hand sketch the quiz grid came from. Historical — it shows image cards, which D14 cancelled. |

## The source of truth is the code

`src/app/globals.css` defines the system. `design-tokens.json` is a mirror kept by hand,
and `/design` is the living reference — every token, every lens, every component state,
rendered. **When a document here disagrees with `/design`, `/design` wins.**

`e2e/design-system.spec.ts` screenshots each section, so token drift shows up as a failing
visual diff rather than as a slow decay nobody notices.

## Screenshots

Captured from `/design` with `scripts/capture-design.ts`.

| File | Shows |
| --- | --- |
| `00-overview-desktop.png` | Whole system, one image (1280 wide) |
| `00-masthead.png` | Wordmark and Baloo 2 at display size |
| `01-brand.png` | Wordmark treatments, the coral swatch family |
| `02-typography.png` | The two voices and their roles |
| `03-surfaces.png` | Cream ground, card, recessed fill, the ink ramp |
| `04-lenses.png` | **The lens mechanism** — the same card three times, one class changed |
| `05-shape-depth.png` | Radius scale, and the toy shadow at rest, raised and pressed |
| `06-controls.png` | Buttons, badges, intake fields at mobile sizes |
| `07-in-situ.png` | **Ranking and timeline** — the two real screens the system exists for |
| `07b-in-situ-mobile.png` | Same, at 390px |
| `08-loading.png` | Skeleton and progress states |
| `99-overview-mobile.png` | Full page at 390×844, the actual target device |

To refresh them after a design change:

```bash
pnpm run design:capture
```

It boots the app, waits for fonts, and rewrites all twelve. Review the diff before
committing — a screenshot updated without looking is worse than none.
