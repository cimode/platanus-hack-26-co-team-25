# The site gate

Until the reveal, nobody may see the app at https://dipia.lat. The gate is one
shared, temporary password that unlocks the whole site for one browser.

## The switch

`SITE_GATE_PASSWORD` is the entire mechanism.

| Value | What happens |
| --- | --- |
| unset or empty | **no gate at all** — this is local dev, CI, Vitest and every Playwright run |
| set | every path answers 401 or redirects to `/gate` until the password is typed |

The repository is **public**, so the value never appears in the source, in a
committed `.env`, in this file or in an issue. It lives only in Vercel's
environment, and is shared with the team privately.

## Enabling it

Set the variable for **Production and Preview** — a Preview URL is as public as
the production domain:

```sh
vercel env add SITE_GATE_PASSWORD production   # value from stdin, never as an argument
vercel env add SITE_GATE_PASSWORD preview
```

Then redeploy (an environment variable is read at request time by
`src/proxy.ts`, but existing deployments keep the environment they were built
with, so redeploy to be sure).

## Disabling it — the reveal

```sh
vercel env rm SITE_GATE_PASSWORD production
vercel env rm SITE_GATE_PASSWORD preview
```

and redeploy. Nothing else changes: no route, no screen, no cookie the app
itself relies on.

## Rotating it logs everyone out

The cookie (`dipia_gate`) holds an HMAC-SHA256 of a fixed string **keyed by the
password**, recomputed from the environment on every request. Change the value
and every browser that had unlocked is locked out again at once — which is also
the emergency response if the password leaks.

## What the gate covers

`src/proxy.ts` exports **no `matcher`**, so it runs on every request: pages,
route handlers, Server Actions (which are POSTs to the page route),
`/_next/static`, `/_next/image`, `/_next/data`, `/favicon.ico`, `/robots.txt`
and everything under `public/`. The only allow-listed path is `/gate`.

- A navigation (GET/HEAD asking for `text/html`) → `302` to
  `/gate?next=<same-origin path>`.
- Everything else → `401`, empty body, `Cache-Control: no-store`.
- Every gated response carries `X-Robots-Tag: noindex, nofollow`.

`/gate` is a route handler returning one self-contained HTML document — inline
CSS, no `<script>`, no Next assets (there are none to load: they are 401 too),
no product name, Spanish labels. A wrong password re-renders it with a neutral
message after a ~1 s delay.

## Testing it

The gate is off by default, so the existing suite is untouched. The gated run
is its own mode:

```sh
E2E_GATE=1 E2E_PORT=3250 E2E_ISOLATED=1 \
  pnpm exec playwright test e2e/site-gate.spec.ts --project=mobile
```

`E2E_GATE=1` makes `playwright.config.ts` boot the dev server with a throwaway
`SITE_GATE_PASSWORD` and run only `e2e/site-gate.spec.ts`; without it that spec
is the one file left out. The pure helpers are covered by
`src/lib/site-gate/gate.test.ts`.
