export const meta = {
  name: 'create_quest',
  description: 'Author the 15-block quiz in 3 delivered batches of 5 questions + 20 image prompts each',
  whenToUse: 'Generating the intake questionnaire blocks and their option-card image prompts',
  phases: [
    { title: 'Batch 1', detail: 'author 5 blocks, judge desirability, persist' },
    { title: 'Batch 2', detail: 'author 5 blocks, judge desirability, persist' },
    { title: 'Batch 3', detail: 'author 5 blocks, judge desirability, persist' },
  ],
}

// ---- config -----------------------------------------------------------------
const REPO = '/Users/robinsonbrito/hackaton/platanus-hack-26-co-team-25'
const SKILL = REPO + '/.claude/skills/quest-skill/SKILL.md'
const OUT_DIR = (args && args.outDir) || REPO + '/quiz'
const LANGUAGE = (args && args.language) || 'es'
const IMAGES_PER_Q = (args && args.imagesPerQuestion) || 4

const STYLE_TOKEN =
  'flat vector cartoon, warm palette, thick outlines, square 1:1, bold condensed ' +
  'sans-serif caption centered, high contrast, no other text'

// Reversed-keyed focus rotation: every pillar appears in EVERY block (D=4 design);
// equity here means rotating which pillar carries the reversed-keyed option → 4/4/4/3.
const PILLARS = ['regulation', 'politeness', 'reliability', 'agency']
const DOMAINS = [
  'food', 'pets', 'travel', 'friends', 'family',
  'parties', 'neighbors', 'groceries', 'cooking', 'movies-series',
  'gifts', 'roommates', 'sports-casual', 'public-transport', 'weekend-plans',
]
const ASSIGNMENTS = Array.from({ length: 15 }, (_, i) => ({
  id: i + 1,
  focusPillar: PILLARS[i % 4],
  domain: DOMAINS[i],
}))

// ---- schemas ----------------------------------------------------------------
const OPTION = {
  type: 'object',
  required: ['key', 'text', 'pillar', 'keyed'],
  properties: {
    key: { enum: ['a', 'b', 'c', 'd'] },
    text: { type: 'string', maxLength: 60 },
    pillar: { enum: PILLARS },
    keyed: { enum: ['positive', 'reversed'] },
  },
}
const BLOCK = {
  type: 'object',
  required: ['id', 'focusPillar', 'domain', 'language', 'scenario', 'options', 'imagePrompts'],
  properties: {
    id: { type: 'integer' },
    focusPillar: { enum: PILLARS },
    domain: { type: 'string' },
    language: { type: 'string' },
    scenario: { type: 'string', maxLength: 220 },
    options: { type: 'array', minItems: 4, maxItems: 4, items: OPTION },
    imagePrompts: {
      type: 'array', minItems: 4, maxItems: 5,
      items: {
        type: 'object',
        required: ['option', 'prompt'],
        properties: { option: { enum: ['a', 'b', 'c', 'd', 'cover'] }, prompt: { type: 'string' } },
      },
    },
  },
}
const BATCH = {
  type: 'object', required: ['blocks'],
  properties: { blocks: { type: 'array', minItems: 5, maxItems: 5, items: BLOCK } },
}
const VERDICTS = {
  type: 'object', required: ['verdicts'],
  properties: {
    verdicts: {
      type: 'array', minItems: 5, maxItems: 5,
      items: {
        type: 'object',
        required: ['id', 'pass', 'problems'],
        properties: {
          id: { type: 'integer' },
          pass: { type: 'boolean' },
          problems: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
}
const WRITTEN = {
  type: 'object', required: ['path', 'questionCount', 'promptCount'],
  properties: {
    path: { type: 'string' },
    questionCount: { type: 'integer' },
    promptCount: { type: 'integer' },
  },
}

// ---- structural checks the script can run itself ---------------------------
function structuralProblems(b) {
  const p = []
  const pillars = b.options.map(o => o.pillar).sort().join(',')
  if (pillars !== PILLARS.slice().sort().join(',')) p.push('options must load all four pillars exactly once')
  const rev = b.options.filter(o => o.keyed === 'reversed')
  if (rev.length !== 1) p.push('exactly one reversed-keyed option required')
  else if (rev[0].pillar !== b.focusPillar) p.push('reversed option must be the focusPillar')
  if (b.imagePrompts.length < Math.min(IMAGES_PER_Q, 5)) p.push('missing image prompts')
  for (const o of b.options) if (o.text.split(/\s+/).length > 10) p.push('option ' + o.key + ' too long for an image card')
  return p
}

// ---- run --------------------------------------------------------------------
const authorPrompt = (batchAssignments, batchNo) =>
  'Read and follow this skill file exactly: ' + SKILL + '\n' +
  'Also read its assets (block-schema.json, example-block.json) in the same directory, and read ' +
  REPO + '/PILLARS.md sections 2 and 8 for the pillar definitions and hard build rules.\n\n' +
  'Author the 5 quiz blocks for batch ' + batchNo + '. Assignments (id, focusPillar = the pillar ' +
  'whose LOW pole is the reversed-keyed option, domain = scenario flavor):\n' +
  JSON.stringify(batchAssignments) + '\n\n' +
  'language: ' + LANGUAGE + ' · imagesPerQuestion: ' + IMAGES_PER_Q + ' · styleToken: "' + STYLE_TOKEN + '"\n' +
  'Vary scenario structure across the 5 (not five copies of one joke). No scenario may reuse ' +
  'another block\'s premise. Every block loads ALL FOUR pillars, one option each.'

const results = []
for (let b = 0; b < 3; b++) {
  const phaseName = 'Batch ' + (b + 1)
  phase(phaseName)
  const assignments = ASSIGNMENTS.slice(b * 5, b * 5 + 5)

  let { blocks } = await agent(authorPrompt(assignments, b + 1),
    { label: 'author:batch-' + (b + 1), phase: phaseName, schema: BATCH })

  // judge: desirability + safety + humor, adversarially
  const judged = await agent(
    'You are the desirability judge for forced-choice quiz blocks (see the hard rules in ' + SKILL + ').\n' +
    'For each block below decide pass/fail. FAIL if: any option reads as the obviously flattering ' +
    '"good answer" within 3 seconds; the reversed-keyed option is villainous instead of likable-funny; ' +
    'the scenario is work/deadline-flavored; anything violates A7/A8 safety (substances, politics, ' +
    'religion, sex, mental health, money shame); the humor is flat or mean-spirited; or any option ' +
    'exceeds ~8 words. List concrete problems for every fail.\n\nBLOCKS:\n' + JSON.stringify(blocks),
    { label: 'judge:batch-' + (b + 1), phase: phaseName, schema: VERDICTS })

  const structFails = blocks.filter(x => structuralProblems(x).length)
  const judgeFails = judged.verdicts.filter(v => !v.pass)
  const failIds = [...new Set([...structFails.map(x => x.id), ...judgeFails.map(v => v.id)])]

  if (failIds.length) {
    log(phaseName + ': regenerating ' + failIds.length + ' block(s) — ' + failIds.join(', '))
    const notes = failIds.map(id => ({
      id,
      problems: [
        ...(structFails.find(x => x.id === id) ? structuralProblems(structFails.find(x => x.id === id)) : []),
        ...(judgeFails.find(v => v.id === id) ? judgeFails.find(v => v.id === id).problems : []),
      ],
    }))
    const repaired = await agent(
      'Read and follow this skill file exactly: ' + SKILL + '\n' +
      'These blocks FAILED review. Rewrite each failed block from scratch (same id, focusPillar, ' +
      'domain — new scenario) fixing every listed problem. Keep the passing blocks untouched and ' +
      'return all 5.\nlanguage: ' + LANGUAGE + ' · imagesPerQuestion: ' + IMAGES_PER_Q +
      ' · styleToken: "' + STYLE_TOKEN + '"\n\nFAILURE NOTES:\n' + JSON.stringify(notes) +
      '\n\nALL 5 BLOCKS (rewrite only the failed ids):\n' + JSON.stringify(blocks),
      { label: 'repair:batch-' + (b + 1), phase: phaseName, schema: BATCH })
    blocks = repaired.blocks
  }

  // persist — the script has no filesystem access, so a writer agent lands the file
  const written = await agent(
    'Write this JSON to the file ' + OUT_DIR + '/batch-' + (b + 1) + '.json (create the directory ' +
    'if needed, pretty-printed, UTF-8). Then return path, questionCount (blocks) and promptCount ' +
    '(total imagePrompts across blocks). Do not alter the content.\n\n' +
    JSON.stringify({ batch: b + 1, language: LANGUAGE, styleToken: STYLE_TOKEN, blocks }),
    { label: 'persist:batch-' + (b + 1), phase: phaseName, schema: WRITTEN })

  log('DELIVERED batch ' + (b + 1) + ' → ' + written.path + ' (' +
    written.questionCount + ' questions, ' + written.promptCount + ' image prompts)')
  results.push(written)
}

return {
  batches: results,
  totalQuestions: results.reduce((s, r) => s + r.questionCount, 0),
  totalPrompts: results.reduce((s, r) => s + r.promptCount, 0),
  reversedKeyRotation: ASSIGNMENTS.map(a => a.id + ':' + a.focusPillar),
}
