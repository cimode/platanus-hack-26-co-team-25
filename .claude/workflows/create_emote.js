export const meta = {
  name: 'create_emote',
  description: 'Generate, judge and pack one emote (celebrate, wave, cry, walk, angry, fight, defeat, love) for every avatar',
  whenToUse: 'Adding a reaction spritesheet to the room: one emotion in, packed assets + manifest out',
  phases: [
    { title: 'Generate', detail: 'image-to-video attempts per avatar via AI Gateway' },
    { title: 'Judge', detail: 'read the contact sheets, pick the clip and the trim' },
    { title: 'Pack', detail: 'chroma key, pixelize, spritesheet, manifest' },
  ],
}

// ---- config -----------------------------------------------------------------
// Relative by default: workflow scripts have no fs access, but subagents run
// with the repo as their cwd. Needs AI_GATEWAY_API_KEY in .env (pnpm loads it).
const REPO = (args && args.repo) || '.'
const EMOTION = (args && args.emotion) || 'celebrate'
const AVATARS = (args && args.avatars) || ['avatar1', 'avatar2', 'avatar3', 'avatar4']
const ATTEMPTS = (args && args.attempts) || 2
const MODEL = (args && args.model) || 'klingai/kling-v2.6-i2v'
const MAX_ROUNDS = 2 // one regeneration if no attempt passes the judge

const KNOWN = ['celebrate', 'wave', 'cry', 'walk', 'angry', 'fight', 'defeat', 'love']
if (!KNOWN.includes(EMOTION)) throw new Error('emotion must be one of ' + KNOWN.join(', '))

// ---- schemas ----------------------------------------------------------------
const GENERATED = {
  type: 'object', required: ['attempts'],
  properties: {
    attempts: {
      type: 'array',
      items: {
        type: 'object', required: ['index'],
        properties: {
          index: { type: 'integer' },
          clip: { type: 'string' },
          contact: { type: 'string' },
          genSeconds: { type: 'integer' },
          error: { type: 'string' },
        },
      },
    },
  },
}
const VERDICT = {
  type: 'object', required: ['winner', 'trimSeconds', 'verdicts'],
  properties: {
    winner: { type: ['integer', 'null'] },
    trimSeconds: { type: 'number' },
    verdicts: {
      type: 'array',
      items: {
        type: 'object', required: ['index', 'pass', 'problems'],
        properties: {
          index: { type: 'integer' },
          pass: { type: 'boolean' },
          problems: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
}
const PACKED = {
  type: 'object', required: ['src', 'frames', 'bytes'],
  properties: { src: { type: 'string' }, frames: { type: 'integer' }, bytes: { type: 'integer' } },
}

// ---- prompts ----------------------------------------------------------------
const generatePrompt = (avatar, round) =>
  'From the repo root ' + REPO + ', run exactly:\n' +
  '  pnpm emotes:generate --avatar ' + avatar + ' --emotion ' + EMOTION +
  ' --attempts ' + ATTEMPTS + ' --model ' + MODEL + '\n' +
  '(round ' + round + '; it takes 1-5 minutes, wait for it). It prints one JSON object; return its ' +
  '"attempts" array verbatim (index, clip, contact, genSeconds, or error). Do not judge the clips.'

const judgePrompt = (avatar, attempts) =>
  'You are judging candidate clips for the "' + EMOTION + '" reaction of ' + avatar + ' in a ' +
  'Habbo-style pixel-art room. Use the Read tool on each contact sheet PNG below (it shows you the ' +
  'image). A contact sheet shows every 2nd frame of a 12 fps clip, 12 cells per row, row-major: ' +
  'cell c (0-based) is at c/6 seconds.\n\n' +
  'For each attempt decide pass/fail on ALL of these:\n' +
  ' 1. identity kept: same hair, clothes and shoes as the first cell in every cell\n' +
  ' 2. the face stays a blank oval (no eyes, nose or mouth drawn in any cell)\n' +
  ' 3. the head stays roughly in place (it may bob; it must not turn away or leave the frame)\n' +
  ' 4. the gesture is legible as "' + EMOTION + '" within the first 4 seconds\n' +
  ' 5. the character returns to the starting pose by the end\n' +
  'Pick the best passing attempt as winner (null if none pass). trimSeconds = the time of the ' +
  'first cell AFTER the gesture where the character is back in the starting pose, rounded UP to ' +
  'the nearest 0.5 s, at least 2 and at most 5. Return winner, trimSeconds, verdicts.\n\n' +
  'ATTEMPTS:\n' + JSON.stringify(attempts.map(a => ({ index: a.index, contact: a.contact })))

const packPrompt = (avatar, clip, trim) =>
  'From the repo root ' + REPO + ', run exactly:\n' +
  '  pnpm emotes:pack --avatar ' + avatar + ' --emotion ' + EMOTION + ' --clip ' + clip +
  ' --trim ' + trim + ' --model ' + MODEL + '\n' +
  'It prints one JSON object; return its src, frames and bytes.'

// ---- run --------------------------------------------------------------------
log('create_emote: ' + EMOTION + ' for ' + AVATARS.join(', ') + ' (' + ATTEMPTS + ' attempts each)')

const results = await pipeline(
  AVATARS,
  async avatar => {
    let verdict = null
    let usable = []
    for (let round = 1; round <= MAX_ROUNDS && !(verdict && verdict.winner != null); round++) {
      const generated = await agent(generatePrompt(avatar, round),
        { label: 'generate:' + avatar + (round > 1 ? ':r' + round : ''), phase: 'Generate', schema: GENERATED })
      usable = (generated ? generated.attempts : []).filter(a => a.clip && a.contact)
      const failed = (generated ? generated.attempts : []).filter(a => a.error)
      if (failed.length) log(avatar + ': ' + failed.length + ' attempt(s) errored: ' + failed.map(f => f.error).join(' | '))
      if (!usable.length) continue
      verdict = await agent(judgePrompt(avatar, usable),
        { label: 'judge:' + avatar + (round > 1 ? ':r' + round : ''), phase: 'Judge', schema: VERDICT })
      if (verdict && verdict.winner == null)
        log(avatar + ': no attempt passed (' +
          verdict.verdicts.map(v => '#' + v.index + ' ' + v.problems.join('; ')).join(' / ') + ')')
    }
    if (!verdict || verdict.winner == null) return { avatar, packed: null, verdict }
    const winner = usable.find(a => a.index === verdict.winner)
    if (!winner) return { avatar, packed: null, verdict }
    const packed = await agent(packPrompt(avatar, winner.clip, verdict.trimSeconds),
      { label: 'pack:' + avatar, phase: 'Pack', schema: PACKED })
    log('DELIVERED ' + avatar + '/' + EMOTION + ' → ' + (packed ? packed.src + ' (' + packed.frames + ' frames)' : 'pack failed'))
    return { avatar, packed, verdict }
  },
)

const delivered = results.filter(Boolean).filter(r => r.packed)
const skipped = results.filter(Boolean).filter(r => !r.packed).map(r => r.avatar)
if (skipped.length) log('NOT delivered (no passing clip after ' + MAX_ROUNDS + ' rounds): ' + skipped.join(', '))
return {
  emotion: EMOTION,
  delivered: delivered.map(r => ({ avatar: r.avatar, ...r.packed, trimSeconds: r.verdict.trimSeconds })),
  skipped,
  manifest: REPO + '/public/sprites/emotes/manifest.json',
}
