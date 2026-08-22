import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * CI workflow invariants for issue #5 -- a Neon branch per PR, production
 * migrated only from main.
 *
 * Everything here reads the workflow files as text: a line-indentation job
 * splitter plus regexes. `yaml` is deliberately not a dependency.
 *
 * The repo is pnpm (PR #15) and has no eslint job (Biome replaced it), so the
 * script matcher is `pnpm run <script>` and the gate set AC-6 asserts is
 * {typecheck, biome, audit, db-check, unit, build, e2e}.
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

/**
 * Fails with `message` instead of throwing a TypeError three lines later, and
 * narrows the type for what follows.
 */
function required<T>(value: T | undefined, message: string): T {
  expect(value, message).toBeDefined();
  return value as T;
}

function requireJob(jobs: Map<string, string>, name: string): string {
  expect([...jobs.keys()], `${name} job is missing`).toContain(name);
  return jobs.get(name) ?? "";
}

/** The steps of a job, split on the `- ` bullets under `steps:`. */
function splitSteps(job: string): string[] {
  const lines = job.split("\n");
  const start = lines.findIndex((line) => /^ {4}steps:\s*$/.test(line));
  if (start === -1) {
    return [];
  }
  const steps: string[] = [];
  let current: string[] | null = null;
  for (const line of lines.slice(start + 1)) {
    if (line.trim() !== "" && !/^ {6}/.test(line)) {
      break;
    }
    if (/^ {6}- /.test(line)) {
      if (current) {
        steps.push(current.join("\n"));
      }
      current = [line];
    } else if (current) {
      current.push(line);
    }
  }
  if (current) {
    steps.push(current.join("\n"));
  }
  return steps;
}

function unquote(value: string): string {
  const trimmed = value.trim();
  const quoted = /^"(.*)"$/.exec(trimmed) ?? /^'(.*)'$/.exec(trimmed);
  return quoted ? quoted[1] : trimmed;
}

/** Collapses whitespace so `${{ x }}` and `${{  x  }}` compare equal. */
function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * The first `key:` value in a step or job body, unquoted. The `- ` of a step's
 * opening line is optional, so `- uses: x` and `  uses: x` both resolve.
 */
function field(text: string, key: string): string | undefined {
  const match = new RegExp(`^\\s*(?:-\\s+)?${key}:[ \\t]*(.*)$`, "m").exec(
    text
  );
  return match ? unquote(match[1]) : undefined;
}

/** A job's `needs`, in any of the three shapes Actions accepts. */
function needsOf(job: string): string[] {
  const inline = /^ {4}needs:[ \t]*\[(.*)\]\s*$/m.exec(job);
  if (inline) {
    return inline[1]
      .split(",")
      .map(unquote)
      .filter((name) => name !== "");
  }
  const single = /^ {4}needs:[ \t]*([\w-]+)\s*$/m.exec(job);
  if (single) {
    return [single[1]];
  }
  const lines = job.split("\n");
  const start = lines.findIndex((line) => /^ {4}needs:\s*$/.test(line));
  if (start === -1) {
    return [];
  }
  const names: string[] = [];
  for (const line of lines.slice(start + 1)) {
    const item = /^ {6}- ([\w-]+)\s*$/.exec(line);
    if (!item) {
      break;
    }
    names.push(item[1]);
  }
  return names;
}

/** The keys a job publishes under `outputs:`. */
function outputKeys(job: string): string[] {
  const lines = job.split("\n");
  const start = lines.findIndex((line) => /^ {4}outputs:\s*$/.test(line));
  if (start === -1) {
    return [];
  }
  const keys: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === "") {
      continue;
    }
    if (!/^ {6}/.test(line)) {
      break;
    }
    const key = /^ {6}([\w-]+):/.exec(line);
    if (key) {
      keys.push(key[1]);
    }
  }
  return keys;
}

/** A step's `run:` script, block scalar or single line, dedented. */
function runScript(step: string): string {
  const lines = step.split("\n");
  const start = lines.findIndex((line) =>
    /^\s*(?:-\s+)?run:\s*[|>][-+]?\s*$/.test(line)
  );
  if (start === -1) {
    return field(step, "run") ?? "";
  }
  const body = lines.slice(start + 1);
  const indent = /^\s*/.exec(body[0] ?? "")?.[0].length ?? 0;
  const script: string[] = [];
  for (const line of body) {
    const width = /^\s*/.exec(line)?.[0].length ?? 0;
    if (line.trim() !== "" && width < indent) {
      break;
    }
    script.push(line.slice(indent));
  }
  return script.join("\n").trimEnd();
}

/** Matches `pnpm run <script>` anywhere in a step. */
function runsScript(step: string, script: string): boolean {
  return new RegExp(`\\bpnpm run ${script}\\b`).test(step);
}

function stepsUsing(job: string, action: string): string[] {
  return splitSteps(job).filter((step) => field(step, "uses") === action);
}

/** The `${{ … }}` Actions would write around `inner`. */
function expr(inner: string): string {
  return `\${{ ${inner} }}`;
}

const CREATE_BRANCH = "neondatabase/create-branch-action@v6";
const RESET_BRANCH = "neondatabase/reset-branch-action@v1";
const DELETE_BRANCH = "neondatabase/delete-branch-action@v3";
const PROJECT_ID = expr("vars.NEON_PROJECT_ID");
const API_KEY = expr("secrets.NEON_API_KEY");

const EVENT_NUMBER = "4242";
const RUN_ID = "9999";

function contextValue(expr: string, eventName: string): string | undefined {
  if (expr === "github.event_name") {
    return eventName;
  }
  if (
    expr === "github.event.number" ||
    expr === "github.event.pull_request.number"
  ) {
    return EVENT_NUMBER;
  }
  if (expr === "github.run_id") {
    return RUN_ID;
  }
  return undefined;
}

function isTruthy(condition: string, eventName: string): boolean {
  const equality = /^(.+?)\s*(==|!=)\s*'(.*)'$/.exec(condition.trim());
  if (!equality) {
    return false;
  }
  const [, left, operator, right] = equality;
  const value = contextValue(left.trim(), eventName) ?? "";
  return operator === "==" ? value === right : value !== right;
}

/**
 * Resolves the slice of GitHub expression syntax a `branch_name` needs:
 * interpolation, `format('a-{0}', x)`, `'literal'`, and an `A && B || C`
 * ternary on `github.event_name`. Anything else resolves to `<expr>` so the
 * assertion fails loudly rather than passing on an expression nobody read.
 */
function evaluate(expr: string, eventName: string): string {
  const trimmed = expr.trim();
  const ternary = /^(.+?)\s*&&\s*(.+?)\s*\|\|\s*(.+)$/.exec(trimmed);
  if (ternary) {
    const [, condition, whenTrue, whenFalse] = ternary;
    return evaluate(
      isTruthy(condition, eventName) ? whenTrue : whenFalse,
      eventName
    );
  }
  const formatted = /^format\(\s*'([^']*)'\s*,\s*(.+)\)$/.exec(trimmed);
  if (formatted) {
    const args = formatted[2].split(",").map((arg) => arg.trim());
    return formatted[1].replace(/\{(\d+)\}/g, (_, index: string) =>
      evaluate(args[Number(index)] ?? "", eventName)
    );
  }
  const literal = /^'(.*)'$/.exec(trimmed);
  if (literal) {
    return literal[1];
  }
  return contextValue(trimmed, eventName) ?? `<${trimmed}>`;
}

function resolveExpression(value: string, eventName: string): string {
  // Lazy up to `}}`: a `format('preview/pr-{0}', …)` carries single braces.
  return value.replace(/\$\{\{([\s\S]*?)\}\}/g, (_, expr: string) =>
    evaluate(expr, eventName)
  );
}

/** Every line that gives DATABASE_URL a value, as YAML env or as shell. */
function databaseUrlAssignments(job: string): string[] {
  const lines = job.split("\n");
  const assignments: string[] = [];
  for (const [i, line] of lines.entries()) {
    if (!/DATABASE_URL\s*[:=]/.test(line)) {
      continue;
    }
    // A block scalar (`>-`, `|`) carries its value on the next line.
    assignments.push(
      /[>|][-+]?\s*$/.test(line) ? `${line}\n${lines.at(i + 1) ?? ""}` : line
    );
  }
  return assignments;
}

const ci = withoutComments(readWorkflow("ci.yml"));
const cleanup = withoutComments(readWorkflow("neon-branch-cleanup.yml"));
const ciJobs = splitJobs(ci);

describe("ci.yml", () => {
  it("AC-1 · neon-branch creates preview/pr-<n> from ci-base, migrates, seeds", () => {
    const job = requireJob(ciJobs, "neon-branch");
    const steps = splitSteps(job);
    const create = required(
      steps.find((step) => field(step, "uses") === CREATE_BRANCH),
      `neon-branch has no ${CREATE_BRANCH} step`
    );

    expect(field(create, "project_id")).toBe(PROJECT_ID);
    expect(field(create, "api_key")).toBe(API_KEY);
    expect(field(create, "parent_branch")).toBe("ci-base");

    const branchName = required(
      field(create, "branch_name"),
      "the create step has no branch_name input"
    );
    // The expression is resolved here, so it has to be inline on the input:
    // an indirection through another step's output resolves to `<steps.…>`
    // and fails, because nothing here can read that step's runtime value.
    expect(
      resolveExpression(branchName, "pull_request"),
      `branch_name: ${branchName}`
    ).toBe(`preview/pr-${EVENT_NUMBER}`);

    const createIndex = steps.indexOf(create);
    const migrateIndex = steps.findIndex((step) =>
      runsScript(step, "db:migrate")
    );
    const seedIndex = steps.findIndex((step) => runsScript(step, "db:seed"));
    expect(migrateIndex, "no db:migrate step in neon-branch").toBeGreaterThan(
      createIndex
    );
    expect(seedIndex, "db:seed must follow db:migrate").toBeGreaterThan(
      migrateIndex
    );

    const id = required(
      field(create, "id"),
      "the create step needs an `id:` so later steps can read its outputs"
    );
    const pooled = expr(`steps.${id}.outputs.db_url_pooled`);
    for (const index of [migrateIndex, seedIndex]) {
      const url = required(
        field(steps[index], "DATABASE_URL"),
        `step ${index} of neon-branch has no DATABASE_URL`
      );
      expect(normalize(url)).toBe(pooled);
    }
  });

  it("AC-2 · a reused PR branch is reset to parent first, a fresh one is not", () => {
    const job = requireJob(ciJobs, "neon-branch");
    const steps = splitSteps(job);
    const create = required(
      steps.find((step) => field(step, "uses") === CREATE_BRANCH),
      `neon-branch has no ${CREATE_BRANCH} step`
    );
    const migrateIndex = steps.findIndex((step) =>
      runsScript(step, "db:migrate")
    );
    expect(migrateIndex, "no db:migrate step in neon-branch").toBeGreaterThan(
      -1
    );

    const between = steps.slice(steps.indexOf(create) + 1, migrateIndex);
    const resets = between.filter(
      (step) => field(step, "uses") === RESET_BRANCH
    );
    expect(
      resets,
      `exactly one ${RESET_BRANCH} step between create and db:migrate`
    ).toHaveLength(1);

    const reset = resets[0];
    expect(field(reset, "parent")).toBe("true");
    expect(field(reset, "project_id")).toBe(PROJECT_ID);
    expect(field(reset, "api_key")).toBe(API_KEY);

    const createId = required(
      field(create, "id"),
      "the create step needs an `id:` so the reset step can point at it"
    );
    const branch = required(
      field(reset, "branch"),
      "the reset step has no branch input"
    );
    const sameBranch =
      branch.includes(`steps.${createId}.outputs.`) ||
      resolveExpression(branch, "pull_request") ===
        resolveExpression(field(create, "branch_name") ?? "", "pull_request");
    expect(sameBranch, `reset branch: ${branch}`).toBe(true);

    // True only when the branch already existed: `created` is the string
    // 'false'. A freshly created branch must not be reset.
    const condition = normalize(
      required(field(reset, "if"), "the reset step has no `if:`")
    );
    expect(condition).toMatch(
      new RegExp(`steps\\.${createId}\\.outputs\\.created\\s*==\\s*'false'`)
    );
    expect(condition).not.toMatch(/'true'/);
  });

  it("AC-3 · unit and e2e get DATABASE_URL from branch_name, never a secret", () => {
    const neon = requireJob(ciJobs, "neon-branch");
    const outputs = outputKeys(neon);
    expect(outputs).toContain("branch_name");
    for (const key of outputs) {
      expect(
        key,
        "a job output would be dropped as a masked value"
      ).not.toMatch(/db_url|password/);
    }

    for (const name of ["unit", "e2e"]) {
      const job = requireJob(ciJobs, name);
      expect(needsOf(job), `${name} needs`).toContain("neon-branch");
      expect(
        normalize(field(job, "DB_REQUIRED") ?? ""),
        `${name} DB_REQUIRED`
      ).toBe("1");

      const create = required(
        splitSteps(job).find((step) => field(step, "uses") === CREATE_BRANCH),
        `${name} has no ${CREATE_BRANCH} step to resolve the branch URL`
      );
      expect(normalize(field(create, "branch_name") ?? "")).toBe(
        expr("needs.neon-branch.outputs.branch_name")
      );
      expect(field(create, "parent_branch")).toBe("ci-base");

      const id = required(
        field(create, "id"),
        `${name}: the create step needs an \`id:\``
      );
      const assignments = databaseUrlAssignments(job);
      expect(assignments, `${name} never sets DATABASE_URL`).not.toHaveLength(
        0
      );
      for (const assignment of assignments) {
        expect(
          normalize(assignment),
          `${name}: ${assignment.trim()}`
        ).toContain(`steps.${id}.outputs.db_url_pooled`);
        expect(assignment, `${name}: ${assignment.trim()}`).not.toMatch(
          /secrets\./
        );
      }
    }
  });

  it("AC-4 · deploy-preview passes the PR branch URL with -e, still --prebuilt", () => {
    const job = requireJob(ciJobs, "deploy-preview");
    expect(needsOf(job)).toContain("neon-branch");
    expect(
      job,
      "deploy-preview must not see a DATABASE_URL secret"
    ).not.toMatch(/secrets\.DATABASE_URL/);

    const deploy = required(
      job
        .split("\n")
        .find(
          (line) =>
            /vercel[^\n]*\bdeploy\b/.test(line) && !/--prod\b/.test(line)
        ),
      "deploy-preview has no `vercel deploy` command"
    );
    expect(deploy).toContain("--prebuilt");
    expect(deploy).toContain("-e DATABASE_URL=");

    const raw = required(
      /-e DATABASE_URL=(\S+)/.exec(deploy)?.[1],
      "-e DATABASE_URL= carries no value"
    );
    const value = unquote(raw);
    if (value.includes("db_url_pooled")) {
      expect(value).toMatch(/steps\.[\w-]+\.outputs\.db_url_pooled/);
      return;
    }
    // A shell variable is fine, as long as this job assigned it from the
    // branch's pooled URL.
    const variable = required(
      /^\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?$/.exec(value)?.[1],
      `-e DATABASE_URL=${value} is neither an outputs expression nor a variable`
    );
    const assignments = job
      .split("\n")
      .filter((line) => new RegExp(`\\b${variable}\\s*[:=]`).test(line));
    expect(
      assignments.some((line) =>
        /steps\.[\w-]+\.outputs\.db_url_pooled/.test(line)
      ),
      `${variable} is never assigned from the branch's pooled URL`
    ).toBe(true);
  });

  it("AC-5 · a push to main gets ci/main-<run_id>, deleted even on failure", () => {
    const neon = requireJob(ciJobs, "neon-branch");
    const create = required(
      splitSteps(neon).find((step) => field(step, "uses") === CREATE_BRANCH),
      `neon-branch has no ${CREATE_BRANCH} step`
    );
    const branchName = field(create, "branch_name") ?? "";
    expect(
      resolveExpression(branchName, "push"),
      `branch_name: ${branchName}`
    ).toBe(`ci/main-${RUN_ID}`);

    const job = requireJob(ciJobs, "neon-branch-delete");
    expect(needsOf(job)).toEqual(
      expect.arrayContaining(["neon-branch", "unit", "e2e"])
    );

    const condition = normalize(
      required(field(job, "if"), "neon-branch-delete has no `if:`")
    );
    expect(condition).toContain("always()");
    expect(condition).toMatch(/github\.event_name == 'push'/);

    const uses = splitSteps(job)
      .map((step) => field(step, "uses"))
      .filter((action): action is string => action !== undefined);
    expect(uses, "neon-branch-delete does more than delete a branch").toEqual([
      DELETE_BRANCH,
    ]);

    const del = stepsUsing(job, DELETE_BRANCH)[0] ?? "";
    expect(normalize(field(del, "branch") ?? "")).toBe(
      expr("needs.neon-branch.outputs.branch_name")
    );
    expect(field(del, "project_id")).toBe(PROJECT_ID);
    expect(field(del, "api_key")).toBe(API_KEY);
  });

  it("AC-6 · migrate-production needs every gate, deploy-production needs it", () => {
    const dbCheck = requireJob(ciJobs, "db-check");
    expect(
      splitSteps(dbCheck).some((step) => runsScript(step, "db:check")),
      "db-check does not run db:check"
    ).toBe(true);
    expect(dbCheck, "db-check must run without a database").not.toContain(
      "DATABASE_URL"
    );

    const job = requireJob(ciJobs, "migrate-production");
    const condition = normalize(
      required(field(job, "if"), "migrate-production has no `if:`")
    );
    expect(condition).toMatch(/github\.event_name == 'push'/);
    expect(condition).toMatch(/github\.ref == 'refs\/heads\/main'/);

    // Every gate the pipeline defines, exactly: a new gate that
    // migrate-production does not wait on is a migration that can outrun a
    // failing check.
    expect([...needsOf(job)].sort()).toEqual(
      ["audit", "biome", "build", "db-check", "e2e", "typecheck", "unit"].sort()
    );

    const steps = splitSteps(job);
    const migrateIndex = steps.findIndex((step) =>
      runsScript(step, "db:migrate")
    );
    const seedIndex = steps.findIndex((step) => runsScript(step, "db:seed"));
    expect(migrateIndex, "no db:migrate step").toBeGreaterThan(-1);
    expect(seedIndex, "db:seed must follow db:migrate").toBeGreaterThan(
      migrateIndex
    );
    for (const index of [migrateIndex, seedIndex]) {
      expect(normalize(field(steps[index], "DATABASE_URL") ?? "")).toBe(
        expr("secrets.DATABASE_URL_PRODUCTION")
      );
    }

    expect(needsOf(requireJob(ciJobs, "deploy-production"))).toContain(
      "migrate-production"
    );
  });

  it("AC-7 · the guard fails naming DATABASE_URL_PRODUCTION on an empty URL", () => {
    const job = requireJob(ciJobs, "migrate-production");
    const steps = splitSteps(job);
    const guardIndex = steps.findIndex(
      (step) =>
        field(step, "name") ===
        "Refuse to migrate without DATABASE_URL_PRODUCTION"
    );
    expect(
      guardIndex,
      'no step named "Refuse to migrate without DATABASE_URL_PRODUCTION"'
    ).toBeGreaterThan(-1);

    const guard = steps[guardIndex];
    const migrateIndex = steps.findIndex((step) =>
      runsScript(step, "db:migrate")
    );
    expect(migrateIndex, "the guard must precede db:migrate").toBeGreaterThan(
      guardIndex
    );
    expect(field(guard, "continue-on-error")).toBeUndefined();

    const script = runScript(guard);
    expect(script, "the guard step has no run script").not.toBe("");
    // It reads the env, so a shell can run it exactly as Actions would.
    expect(
      script,
      "the guard must read DATABASE_URL from the env"
    ).not.toContain("${{");

    const run = (databaseUrl: string) =>
      spawnSync("bash", ["-eo", "pipefail", "-c", script], {
        encoding: "utf8",
        // The explicit DATABASE_URL wins over anything the laptop exports.
        env: { ...process.env, DATABASE_URL: databaseUrl },
      });

    const empty = run("");
    expect(empty.status, "an empty DATABASE_URL must fail the job").not.toBe(0);
    expect(`${empty.stdout}${empty.stderr}`).toContain(
      "DATABASE_URL_PRODUCTION"
    );

    const set = run("postgresql://user:pw@ep-example.neon.tech/db?ssl=require");
    expect(set.status, `${set.stdout}${set.stderr}`).toBe(0);
  });
});

describe("safety invariants", () => {
  it("AC-8 · only migrate-production sees production; every parent is ci-base", () => {
    // Both files are the subject of this invariant, so both must exist.
    expect(ci, "ci.yml is missing").not.toBe("");
    expect(cleanup, "neon-branch-cleanup.yml is missing").not.toBe("");

    // DATABASE_URL_PRODUCTION lives inside migrate-production and nowhere else.
    const mentions = (text: string) =>
      text.split("DATABASE_URL_PRODUCTION").length - 1;
    expect(mentions(ci), "nothing migrates production").toBeGreaterThan(0);
    expect(mentions(ci)).toBe(mentions(ciJobs.get("migrate-production") ?? ""));
    expect(mentions(cleanup)).toBe(0);

    // Tests and previews never take DATABASE_URL from a secret.
    for (const name of ["unit", "e2e", "deploy-preview"]) {
      const job = requireJob(ciJobs, name);
      const lines = job.split("\n");
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
    const parents: string[] = [];
    for (const [, key, raw] of `${ci}\n${cleanup}`.matchAll(branchKeys)) {
      const value = unquote(raw);
      if (key === "parent_branch") {
        parents.push(value);
        expect(value, `parent_branch: ${raw}`).toBe("ci-base");
      }
      expect(value, `${key}: ${raw}`).not.toMatch(/\bproduction\b/);
    }
    expect(parents, "no Neon branch declares a parent").not.toHaveLength(0);
  });
});

describe("neon-branch-cleanup.yml", () => {
  it("AC-9 · a closed PR deletes preview/pr-<n> and triggers on nothing else", () => {
    expect(cleanup, "neon-branch-cleanup.yml is missing").not.toBe("");

    const lines = cleanup.split("\n");
    const start = lines.findIndex((line) => /^on:\s*$/.test(line));
    expect(start, "no `on:` block").toBeGreaterThan(-1);
    const triggers: string[] = [];
    for (const line of lines.slice(start + 1)) {
      if (line.trim() !== "" && !/^ {2}/.test(line)) {
        break;
      }
      const key = /^ {2}([\w-]+):/.exec(line);
      if (key) {
        triggers.push(key[1]);
      }
    }
    expect(triggers).toEqual(["pull_request"]);
    expect(normalize(field(cleanup, "types") ?? "")).toBe("[closed]");

    const jobs = splitJobs(cleanup);
    expect([...jobs.keys()], "the cleanup workflow has one job").toHaveLength(
      1
    );

    const job = jobs.values().next().value ?? "";
    const deletes = stepsUsing(job, DELETE_BRANCH);
    expect(deletes, `one ${DELETE_BRANCH} step`).toHaveLength(1);
    expect(
      resolveExpression(field(deletes[0], "branch") ?? "", "pull_request")
    ).toBe(`preview/pr-${EVENT_NUMBER}`);
    expect(field(deletes[0], "project_id")).toBe(PROJECT_ID);
    expect(field(deletes[0], "api_key")).toBe(API_KEY);
  });
});
