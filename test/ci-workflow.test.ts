import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * CI workflow invariants for issue #5 -- a Neon branch per PR, production
 * migrated only from main.
 *
 * Everything here reads the workflow files as text: a line-indentation job
 * splitter plus regexes. `yaml` is deliberately not a dependency.
 *
 * Most of it is skipped because the jobs do not exist yet. Each `it.skip`
 * names what it waits on, so when that job lands you delete one word and get
 * a real guard. AC-8 is the safety invariant and runs today: vacuously true
 * until the feature exists, and it stays true as each piece arrives.
 */

const WORKFLOWS = new URL("../.github/workflows/", import.meta.url);

/** The workflow's text, or "" when the file does not exist yet. */
function readWorkflow(name: string): string {
  const url = new URL(name, WORKFLOWS);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

/**
 * Splits a workflow into its top-level jobs by indentation: a two-space key
 * under `jobs:` opens a job and owns every line up to the next one.
 */
function splitJobs(text: string): Map<string, string> {
  const jobs = new Map<string, string>();
  const lines = text.split("\n");
  const start = lines.findIndex((line) => /^jobs:\s*$/.test(line));
  if (start === -1) {
    return jobs;
  }
  let name: string | null = null;
  let body: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^[^\s#]/.test(line)) {
      break;
    }
    const key = /^ {2}([\w-]+):\s*$/.exec(line);
    if (key) {
      if (name !== null) {
        jobs.set(name, body.join("\n"));
      }
      name = key[1];
      body = [];
    } else if (name !== null) {
      body.push(line);
    }
  }
  if (name !== null) {
    jobs.set(name, body.join("\n"));
  }
  return jobs;
}

/** Full-line YAML comments cannot leak a secret; drop them before matching. */
function withoutComments(text: string): string {
  return text.replace(/^\s*#.*$/gm, "");
}

describe("ci.yml", () => {
  // TODO: un-skip when the neon-branch job exists.
  // Blocked on: neon-branch job in ci.yml (create-branch-action@v6 with
  // parent_branch ci-base, then db:migrate and db:seed on db_url_pooled).
  it.skip("AC-1 · neon-branch creates preview/pr-<n> from ci-base, migrates, seeds", () => {});

  // TODO: un-skip when the reset step in neon-branch exists.
  // Blocked on: reset-branch-action@v1 step gated on created == 'false'.
  it.skip("AC-2 · a reused PR branch is reset to parent first, a fresh one is not", () => {});

  // TODO: un-skip when unit and e2e need neon-branch.
  // Blocked on: unit/e2e resolving DATABASE_URL from branch_name with
  // DB_REQUIRED "1"; neon-branch outputs exposing only branch_name.
  it.skip("AC-3 · unit and e2e get DATABASE_URL from branch_name, never a secret", () => {});

  // TODO: un-skip when deploy-preview passes the branch URL to Vercel.
  // Blocked on: deploy-preview needing neon-branch and adding
  // `-e DATABASE_URL=` to `vercel deploy --prebuilt`.
  it.skip("AC-4 · deploy-preview passes the PR branch URL with -e, still --prebuilt", () => {});

  // TODO: un-skip when the neon-branch-delete job exists.
  // Blocked on: ci/main-<run_id> naming on push and a delete-branch-action@v3
  // job running `if: always()` after unit and e2e.
  it.skip("AC-5 · a push to main gets ci/main-<run_id>, deleted even on failure", () => {});

  // TODO: un-skip when db-check and migrate-production exist.
  // Blocked on: db-check gate, migrate-production (push to main, needs every
  // gate, db:migrate + db:seed on DATABASE_URL_PRODUCTION), deploy-production
  // needing it.
  it.skip("AC-6 · migrate-production needs every gate, deploy-production needs it", () => {});

  // TODO: un-skip when the migrate-production guard step exists.
  // Blocked on: the "Refuse to migrate without DATABASE_URL_PRODUCTION" run
  // step, executed here under bash with a controlled env.
  it.skip("AC-7 · the guard fails naming DATABASE_URL_PRODUCTION on an empty URL", () => {});
});

describe("safety invariants", () => {
  // Runs today, on purpose. Vacuously true until #5 lands -- no job references
  // the production secret, no `parent_branch:` exists, the cleanup workflow is
  // not there yet -- and it keeps holding as each of those arrives.
  it("AC-8 · only migrate-production sees production; every parent is ci-base", () => {
    const ci = withoutComments(readWorkflow("ci.yml"));
    const cleanup = withoutComments(readWorkflow("neon-branch-cleanup.yml"));
    const jobs = splitJobs(ci);

    // DATABASE_URL_PRODUCTION lives inside migrate-production or nowhere.
    const mentions = (text: string) =>
      text.split("DATABASE_URL_PRODUCTION").length - 1;
    expect(mentions(ci)).toBe(mentions(jobs.get("migrate-production") ?? ""));
    expect(mentions(cleanup)).toBe(0);

    // Tests and previews never take DATABASE_URL from a secret.
    for (const name of ["unit", "e2e", "deploy-preview"]) {
      expect(jobs.has(name), `${name} job is missing from ci.yml`).toBe(true);
      const lines = (jobs.get(name) ?? "").split("\n");
      for (const [i, line] of lines.entries()) {
        if (!line.includes("DATABASE_URL")) {
          continue;
        }
        // A block scalar (`>-`, `|`) carries its value on the next line.
        const value = /[>|][-+]?\s*$/.test(line)
          ? `${line}\n${lines.at(i + 1) ?? ""}`
          : line;
        expect(value, `${name}: ${line.trim()}`).not.toMatch(/secrets\./);
      }
    }

    // Every Neon parent is ci-base, and production is never a branch value.
    const branchKeys = /^\s*(parent_branch|branch_name|branch):\s*(.+?)\s*$/gm;
    for (const [, key, raw] of `${ci}\n${cleanup}`.matchAll(branchKeys)) {
      const value = raw.replace(/^["']|["']$/g, "");
      if (key === "parent_branch") {
        expect(value, `parent_branch: ${raw}`).toBe("ci-base");
      }
      expect(value, `${key}: ${raw}`).not.toMatch(/\bproduction\b/);
    }
  });
});

describe("neon-branch-cleanup.yml", () => {
  // TODO: un-skip when neon-branch-cleanup.yml exists.
  // Blocked on: .github/workflows/neon-branch-cleanup.yml (pull_request
  // closed -> delete-branch-action@v3 on preview/pr-<n>).
  it.skip("AC-9 · a closed PR deletes preview/pr-<n> and triggers on nothing else", () => {});
});
