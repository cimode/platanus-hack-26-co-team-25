import { expect, test } from "@playwright/test";

/**
 * The ranking on a phone: a participant picks a lens and sees the room
 * ranked against them (issue #10).
 *
 *     /results/<lens>  loading moment -> switcher + ranked list
 *                                      | empty room | not consented
 *
 * The happy / sad / edge criteria are skipped until the screen and its
 * fixture exist; each `test.skip` names what it waits on, so when that lands
 * you delete one word and get a real guard. The `kind: safety` criteria are
 * NOT skipped: they run today against the current app (vacuously, there is
 * no /results/[lens] yet, so every document is a 404) and have to stay green
 * as the screen lands. A silently skipped safety test is the most expensive
 * kind of green in this product.
 *
 * Behaviour-level only: roles and visible text, never DOM structure. These
 * run on the `mobile` project (390x844). The fixture-backed tests need
 * DATABASE_URL (docs/domain.md §8) and skip with a notice without it unless
 * DB_REQUIRED=1; the two safety tests below need no database today.
 */

const LENSES = ["romantic", "business", "friendship"] as const;

// What a results document may never carry about another participant
// (docs/domain.md §5, D11): gate fields, consent flags, declared bands,
// latents, and the photo field names -- a photo reaches the page only as the
// src of an <img> inside the viewer's own ranking, never under a field name.
const LEAKS = [
  "interested_in",
  "interestedIn",
  "wants_kids",
  "wantsKids",
  "gender",
  "single",
  "consent_",
  "age_band",
  "ageBand",
  "risk_posture",
  "riskPosture",
  "exit_horizon",
  "exitHorizon",
  "redlines",
  "latents",
  "money_posture",
  "moneyPosture",
  "declared_at",
  "photo_url",
  "photoUrl",
];

// The seeded room (e2e/fixtures/results-room.ts, issue #10 Data). A name
// shows up on a results page only inside a ranking whose subject is the
// viewer -- and never the viewer's own.
const PARTICIPANTS = [
  /\bAna\b/,
  /\bBruno\b/,
  /\bCarla\b/,
  /\bDana\b/,
  /\bEva\b/,
];

test.describe("results", () => {
  // TODO: un-skip when /results/[lens] and its fixture exist.
  // Blocked on: src/app/results/[lens]/{layout,loading,page}.tsx,
  // src/components/results/{lens-switcher,ranked-list,scoring-moment}.tsx,
  // prepareResults and e2e/fixtures/results-room.ts (seeded room + cookie
  // helper) against DATABASE_URL.
  test.skip("AC-6 · Ana sees the friendship heading, Bruno above Carla each with photo, band, drivers and friction, neither Ana nor Dana, a switcher without business, and the loading moment in the document", async () => {});

  // TODO: un-skip when the not-consented state and lens validation exist.
  // Blocked on: page.tsx rendering "You did not opt in to the <lens> lens."
  // with the switcher limited to consented lenses, layout.tsx calling
  // notFound() on an unknown lens, and e2e/fixtures/results-room.ts.
  test.skip('AC-7 · Carla sees "You did not opt in to the romantic lens." with no name and a switcher without romantic, and /results/dating is a 404', async () => {});

  // TODO: un-skip when the empty state exists.
  // Blocked on: ranked-list.tsx rendering the empty-room copy for zero
  // entries and the solo room (Eva) in e2e/fixtures/results-room.ts.
  test.skip('AC-8 · a room of one shows the friendship heading and "Nobody else in the room yet — come back when more people have finished." with no error', async () => {});
});

test.describe("safety invariants", () => {
  // Runs today (kind: safety). Nothing about another participant leaves the
  // server beyond what the ranking surface needs (CONTEXT.md §7.3,
  // docs/domain.md §5): the document is RoomMember fields plus the pair's
  // PairScore surface, never gates, consent, bands, latents or a photo field
  // name. Today /results/[lens] does not exist, so every document is a 404
  // and the check is vacuous; when the screen and fixture land, set Bruno's
  // hookai_session cookie on the context first, expect both responses to be
  // 200, /results/romantic to contain Ana's name and photo URL and
  // /results/business to contain Carla's -- keeping the leak loop below on
  // every document.
  test("AC-5 · the ranking document carries the viewer's matches and nothing of anyone's gates, consent, bands, latents or photo fields", async ({
    page,
  }) => {
    for (const lens of LENSES) {
      const response = await page.request.get(`/results/${lens}`);
      const html = await response.text();
      for (const leak of LEAKS) {
        expect(html, `/results/${lens} carries "${leak}"`).not.toContain(leak);
      }
    }
  });

  // Runs today (kind: safety). A ranking is visible only to its subject, and
  // the subject is resolved from the session cookie alone -- never from a
  // route param, query string or form field (docs/domain.md D4, §5). Today
  // no context holds a cookie and /results/friendship is a 404, so no
  // document can carry a participant and the check is vacuous; when the
  // fixture lands, set Ana's cookie on the first context and Bruno's on the
  // second, leave the third without one, replace "bruno-id" with Bruno's
  // seeded id, and expect Ana's two documents to list Bruno and Carla and
  // never Ana, Bruno's to list Ana and Carla and never Bruno, and the
  // cookieless context to end on /intake -- keeping, for every document, the
  // assertion that the viewer's own name and the unlisted names are absent.
  test("AC-9 · a ranking is visible only to its subject, and the subject comes from the session, never from the request", async ({
    browser,
  }) => {
    const ana = await browser.newContext();
    const bruno = await browser.newContext();
    const nobody = await browser.newContext();
    const impersonation =
      "/results/friendship?participant=bruno-id&subject=bruno-id";
    const visits = [
      { context: ana, path: "/results/friendship" },
      { context: ana, path: impersonation },
      { context: bruno, path: "/results/friendship" },
      { context: nobody, path: "/results/friendship" },
    ];

    try {
      for (const { context, path } of visits) {
        const page = await context.newPage();
        const response = await page.request.get(path);
        const html = await response.text();
        for (const name of PARTICIPANTS) {
          expect(html, `${path} carries ${name}`).not.toMatch(name);
        }

        await page.goto(path);
        for (const name of PARTICIPANTS) {
          await expect(
            page.getByRole("listitem").filter({ hasText: name })
          ).toHaveCount(0);
          await expect(page.getByRole("img", { name })).toHaveCount(0);
        }
        await page.close();
      }
    } finally {
      await Promise.all([ana, bruno, nobody].map((c) => c.close()));
    }
  });
});
