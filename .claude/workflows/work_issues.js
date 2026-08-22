export const meta = {
  name: 'work_issues',
  description: 'Drive N independent issues through test → code → test → adversarial review, each to its own PR',
  whenToUse: 'Two or more approved issues whose Files affected tables do not overlap',
  phases: [
    { title: 'Red', detail: 'test-writer: one failing test per acceptance criterion' },
    { title: 'Build', detail: 'code-writer / tester loop until green' },
    { title: 'Review', detail: 'adversarial-reviewer (fable); PR on success' },
  ],
}

// ---- config -----------------------------------------------------------------
// Workflow scripts have no fs access, so every path is passed in. `/work`
// creates one git worktree PER ISSUE before calling this and puts the path in
// `worktree` -- NOT the `isolation: 'worktree'` option, which gives each agent
// its own tree and would hand stage 2 a checkout without stage 1's tests in it.
const REPO = (args && args.repo) || 'platanus-hack/platanus-hack-26-co-team-25'
const ISSUES = (args && args.issues) || []
const MAX_CYCLES = (args && args.maxCycles) != null ? args.maxCycles : 3

if (!ISSUES.length) {
  return { error: 'No issues passed. args.issues must be [{ number, worktree, branch, ac }].' }
}

const RED = {
  type: 'object',
  required: ['allFail', 'rows'],
  properties: {
    allFail: { type: 'boolean', description: 'true only if every AC has a test AND every one fails' },
    untestable: { type: 'array', items: { type: 'string' }, description: 'AC ids that cannot be tested as written' },
    rows: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'file', 'failureReason'],
        properties: {
          id: { type: 'string' },
          file: { type: 'string' },
          failureReason: { type: 'string', description: 'assertion | not-implemented | module-error | other' },
        },
      },
    },
  },
}

const ROUTE = {
  type: 'object',
  required: ['green', 'route'],
  properties: {
    green: { type: 'boolean' },
    route: { type: 'string', enum: ['none', 'code-writer', 'test-writer'] },
    reason: { type: 'string' },
    quotedAc: { type: 'string', description: 'Required when route is test-writer: the AC text the test diverges from' },
  },
}

const VERDICT = {
  type: 'object',
  required: ['satisfied'],
  properties: {
    satisfied: { type: 'boolean' },
    prUrl: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['summary', 'failureScenario'],
        properties: { summary: { type: 'string' }, failureScenario: { type: 'string' } },
      },
    },
  },
}

const where = (i) =>
  `Work in the git worktree at ${i.worktree} (branch ${i.branch}). Every command and file path is relative to THAT directory, not the primary checkout. Repo for gh is ${REPO}.`

const spec = (i) =>
  `Issue #${i.number}. Its acceptance criteria, verbatim:\n\n${i.ac}\n`

// ---- stage 1: red -----------------------------------------------------------
async function red(issue) {
  const r = await agent(
    `${where(issue)}\n\n${spec(issue)}\n` +
      `Write one test per acceptance criterion and the minimum module skeleton ` +
      `(signatures throwing "not implemented") for them to fail on assertions ` +
      `rather than module-resolution errors. Implement no behaviour. Then run ` +
      `the suite and report the AC -> file -> failure-reason table.`,
    { agentType: 'test-writer', label: `red:#${issue.number}`, phase: 'Red', schema: RED, effort: 'high' }
  )
  return { issue, red: r }
}

// ---- stages 2-4: build, test, review ----------------------------------------
async function build({ issue, red }) {
  if (!red) return { issue, blocked: 'stage 1 returned nothing' }
  if (red.untestable && red.untestable.length) {
    // Building against a spec you already know is ambiguous wastes all four stages.
    return { issue, blocked: `untestable acceptance criteria: ${red.untestable.join(', ')}` }
  }
  if (!red.allFail) {
    const bad = red.rows.filter((r) => r.failureReason === 'module-error').map((r) => r.id)
    log(`#${issue.number}: red phase not clean${bad.length ? ` (module errors: ${bad.join(', ')})` : ''}`)
  }

  let feedback = null
  let cycles = 0

  while (cycles <= MAX_CYCLES) {
    await agent(
      `${where(issue)}\n\n${spec(issue)}\n` +
        `Make the failing tests pass. You may not edit any test file.\n` +
        (feedback ? `\nAddress this feedback from the previous pass:\n${feedback}\n` : ''),
      { agentType: 'code-writer', label: `code:#${issue.number}#${cycles}`, phase: 'Build', effort: 'high' }
    )

    const t = await agent(
      `${where(issue)}\n\n${spec(issue)}\n` +
        `Run pnpm run verify and pnpm run test:e2e. Apply only trivial fixes ` +
        `(<10 lines, one file, no signature change). Never edit a test file. ` +
        `Route anything larger.`,
      { agentType: 'tester', label: `test:#${issue.number}#${cycles}`, phase: 'Build', schema: ROUTE, effort: 'medium' }
    )

    if (!t) return { issue, blocked: 'tester returned nothing' }

    if (t.route === 'test-writer') {
      // Only legal with a quoted AC -- otherwise the test stands and the code is wrong.
      if (!t.quotedAc) {
        feedback = `Tester asked to change a test without quoting the AC it diverges from, so the test stands. Fix the code instead. Reason given: ${t.reason || '(none)'}`
        cycles++
        continue
      }
      await agent(
        `${where(issue)}\n\n${spec(issue)}\n` +
          `A test diverges from its acceptance criterion. AC text: ${t.quotedAc}\n` +
          `Divergence: ${t.reason}\nCorrect the test so it encodes the AC. Do not weaken it to make code pass.`,
        { agentType: 'test-writer', label: `retest:#${issue.number}#${cycles}`, phase: 'Build', effort: 'high' }
      )
      cycles++
      continue
    }

    if (!t.green) {
      feedback = t.reason || 'suite still red'
      cycles++
      continue
    }

    const v = await agent(
      `${where(issue)}\n\n${spec(issue)}\n` +
        `Try to break this before a human sees it. Look hardest for tests that ` +
        `pass without proving anything. Run the suites yourself; do not trust ` +
        `the report. If and only if you cannot break it, open the PR with ` +
        `"Closes #${issue.number}" in the body.`,
      { agentType: 'adversarial-reviewer', label: `review:#${issue.number}#${cycles}`, phase: 'Review', schema: VERDICT, effort: 'high' }
    )

    if (v && v.satisfied) return { issue, prUrl: v.prUrl, cycles }

    feedback = v && v.findings
      ? v.findings.map((f) => `- ${f.summary} — breaks when: ${f.failureScenario}`).join('\n')
      : 'reviewer was not satisfied but returned no findings'
    cycles++
  }

  return { issue, blocked: `exhausted ${MAX_CYCLES} code-writer cycles`, feedback }
}

phase('Red')
log(`${ISSUES.length} issue(s), max ${MAX_CYCLES} code-writer cycles each`)

const results = await pipeline(ISSUES, red, build)

const done = results.filter((r) => r && r.prUrl)
const stuck = results.filter((r) => r && r.blocked)
log(`${done.length} opened a PR, ${stuck.length} blocked`)

return {
  opened: done.map((r) => ({ issue: r.issue.number, pr: r.prUrl, cycles: r.cycles })),
  // Blocked issues must go back to status:draft with the reason -- /work does
  // that, because a workflow script cannot call the issue-status skill.
  blocked: stuck.map((r) => ({ issue: r.issue.number, why: r.blocked, feedback: r.feedback })),
}
