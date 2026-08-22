---
name: ui-composition
description: "Trigger: component, page, screen, form, intake form, UI, layout, styling, server component, client component, server action, shadcn, lens, theming. How screens are composed and how they reach a use case in hookai."
license: Apache-2.0
metadata:
  version: "1.0"
---

## Activation Contract

Governs `src/app/**` and `src/components/**` — the driving-adapter and
presentation side. Read `docs/architecture.md` first, and read
`node_modules/next/dist/docs/` for anything framework-shaped: per `AGENTS.md`
this is not the Next.js in your training data.

## 1. Screens call use cases, never the database

The one violation that feels idiomatic in App Router:

```tsx
// WRONG — reads fine, and puts logic where no test can reach it
export default async function RoomPage() {
  const rows = await db.select().from(participants);
}
```

A page or route handler calls a use case with `serverDeps()` from
`src/lib/composition.ts`, which is the only module allowed to build adapters.
Nothing under `src/app/**` or `src/components/**` imports `getDb`, a repository
implementation, or `drizzle-orm`.

## 2. Server Actions for mutations

Verified against the installed Next docs
(`node_modules/next/dist/docs/01-app/02-guides/forms.md`):

```tsx
<form action={submitIntakeAction}>
```

- The action calls the use case. It does not query the database itself.
- For validation errors and pending state, the component holding the `<form>`
  becomes a Client Component using **`useActionState`** — which also gives you
  `pending`. It is not `useFormState`; that name is gone.
- Validate the `FormData` with the schema derived from the table
  (see the `data-access` skill). Never trust the client's shape.
- The docs carry an explicit warning: verify authorisation **inside every
  action**, even when the form only renders on a protected page. An action is a
  public HTTP endpoint.

Server Actions also degrade without JavaScript, which matters here: intake is
QR-distributed to ~100 phones on venue wifi, and `CONTEXT.md` is explicit that
completion rate *is* the demo.

## 3. `"use client"` goes as deep as possible

Default to Server Components. Push `"use client"` down to the smallest thing
that needs interactivity — one block of the form, the lens switcher — never the
page. Every component above the boundary stays off the wire.

The 15-block form is the project's completion-rate risk. Shipping the whole form
as one client island puts all of it in the initial bundle for a phone on
congested wifi.

## 4. Never edit `src/components/ui/**`

That directory is shadcn-owned and deliberately lint-exempt in `biome.json` and
`eslint.config.mjs`. Compose those primitives into `src/components/<feature>/`.
Editing them means the next `shadcn add` silently reverts your work, and the
exemption hides the damage from CI.

## 5. Tokens only, and the lens must thread through

- No raw hex. Not in a `style` prop, not in an arbitrary value like `bg-[#0ff]`.
  ESLint errors on it, because tokens in `src/app/globals.css` are the only
  styling source.
- No invented utilities. `eslint-plugin-better-tailwindcss` reads `globals.css`
  as the Tailwind v4 entry point, so `bg-brand-500` fails if the token is not
  real.
- `lens-romantic` / `lens-business` / `lens-friendship` recolour `--primary` on
  a subtree. A component that hardcodes its accent instead of inheriting breaks
  the ranking's entire visual language, and `e2e/design-system.spec.ts` asserts
  all four contexts resolve to distinct values.
- The app is dark-only; `dark` stays on `<html>`. There is a test.

## 6. Accessible names are a testing requirement

`docs/testing.md` requires behaviour-level assertions — roles and visible text,
never class names. So a control without an accessible name is a control the test
writer **cannot target**, and stage 1 of `/work` stalls on it.

Every interactive element is reachable by `getByRole(...)` with a name.
Icon-only buttons carry an `aria-label`. Inputs are associated with a `<label>`.
Write the markup so `getByRole("button", { name: /continue/i })` works.

## 7. Viewports that matter

390×844 (mobile, the intake target) and 1280×900 (the projected room view).
Both are Playwright projects already. Design mobile-first; the projector view is
the one place desktop matters.

## Hard Rules

1. Nothing under `src/app/**` or `src/components/**` imports `getDb`,
   a repository implementation, or an SDK.
2. Mutations go through a Server Action that calls a use case.
3. Never edit `src/components/ui/**`; compose it.
4. No raw hex, no invented Tailwind utilities.
5. Every interactive element has an accessible name.
6. `"use client"` on the smallest component that needs it, never a page.
