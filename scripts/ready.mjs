#!/usr/bin/env node
/**
 * What can we start right now, and what would collide if we did?
 *
 * Readiness is computed, never stored. A `blocked` label would go stale the
 * moment a dependency closes and nobody re-ran the updater; this cannot.
 *
 *     npm run issues:ready
 */
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const REPO = "platanus-hack/platanus-hack-26-co-team-25";
const STATUS_PREFIX = "status:";

function gh(args) {
  return execFileSync("gh", args, { encoding: "utf8", maxBuffer: 32 << 20 });
}

function statusOf(issue) {
  const label = issue.labels
    .map((l) => l.name)
    .find((n) => n.startsWith(STATUS_PREFIX));
  return label ? label.slice(STATUS_PREFIX.length) : null;
}

function prioOf(issue) {
  const label = issue.labels
    .map((l) => l.name)
    .find((n) => n.startsWith("prio:"));
  return label ? label.slice("prio:".length) : "unset";
}

/** Issue numbers named on the `Depends on:` line. */
function depsOf(body) {
  const line = (body ?? "").match(/^\s*Depends on:\s*(.+)$/im);
  if (!line || /\bnone\b/i.test(line[1])) return [];
  return [...line[1].matchAll(/#(\d+)/g)].map((m) => Number(m[1]));
}

/**
 * The lines under a `## Heading`, up to the next `##`. Split rather than one
 * regex: JS has no `\Z`, so an "until the next heading OR end of string"
 * lookahead silently fails on the last section of a body.
 */
function sectionOf(body, heading) {
  const lines = (body ?? "").split(/\r?\n/);
  const head = new RegExp(`^##\\s*${heading}\\s*$`, "i");
  const start = lines.findIndex((l) => head.test(l));
  if (start === -1) return "";
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^##\s/.test(l));
  return (end === -1 ? rest : rest.slice(0, end)).join("\n");
}

/** Backticked paths inside the `## Files affected` section. */
function filesOf(body) {
  return [...sectionOf(body, "Files affected").matchAll(/`([^`\n]+)`/g)]
    .map((m) => m[1].trim())
    .filter((p) => p.includes("/") || p.includes("."));
}

function main() {
  const issues = JSON.parse(
    gh([
      "issue",
      "list",
      "-R",
      REPO,
      "--state",
      "all",
      "--limit",
      "300",
      "--json",
      "number,title,body,labels,state",
    ])
  );

  const byNumber = new Map(issues.map((i) => [i.number, i]));
  const isDone = (n) => {
    const dep = byNumber.get(n);
    // An unknown dependency is treated as unmet: better to ask than to assume.
    if (!dep) return false;
    return dep.state === "CLOSED" || statusOf(dep) === "completed";
  };

  const inProgress = issues.filter(
    (i) => i.state === "OPEN" && statusOf(i) === "in-progress"
  );
  const claimed = new Map();
  for (const issue of inProgress) {
    for (const f of filesOf(issue.body)) {
      if (!claimed.has(f)) claimed.set(f, []);
      claimed.get(f).push(issue.number);
    }
  }

  const approved = issues.filter(
    (i) => i.state === "OPEN" && statusOf(i) === "approved"
  );
  const ready = [];
  const blocked = [];
  for (const issue of approved) {
    const unmet = depsOf(issue.body).filter((n) => !isDone(n));
    if (unmet.length) blocked.push({ issue, unmet });
    else ready.push(issue);
  }

  const PRIO_ORDER = { high: 0, medium: 1, low: 2, unset: 3 };
  ready.sort((a, b) => PRIO_ORDER[prioOf(a)] - PRIO_ORDER[prioOf(b)]);

  console.log(`\nREADY (${ready.length}) — approved, dependencies met\n`);
  for (const issue of ready) {
    const collisions = filesOf(issue.body)
      .filter((f) => claimed.has(f))
      .map((f) => `${f} (with #${claimed.get(f).join(", #")})`);
    console.log(`  #${issue.number} [${prioOf(issue)}] ${issue.title}`);
    if (collisions.length) {
      console.log(`      ⚠ file collision: ${collisions.join("; ")}`);
    }
  }
  if (!ready.length) console.log("  (nothing)");

  console.log(
    `\nBLOCKED (${blocked.length}) — approved, waiting on a dependency\n`
  );
  for (const { issue, unmet } of blocked) {
    console.log(
      `  #${issue.number} [${prioOf(issue)}] ${issue.title} — needs #${unmet.join(", #")}`
    );
  }
  if (!blocked.length) console.log("  (nothing)");

  console.log(`\nIN PROGRESS (${inProgress.length})\n`);
  for (const issue of inProgress) {
    console.log(`  #${issue.number} ${issue.title}`);
  }
  if (!inProgress.length) console.log("  (nothing)");

  console.log(
    "\nTwo issues are safe to run in parallel when neither is listed above as a" +
      "\nfile collision. Declared dependencies catch ordering; the files table" +
      "\ncatches merge conflicts nobody declared.\n"
  );
}

// Exported so the parsing can be exercised without hitting the network;
// the report only runs when this file is executed directly.
export { depsOf, filesOf, prioOf, sectionOf, statusOf };

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  main();
}
