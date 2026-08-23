export const meta = {
  name: 'create_emotes',
  description: 'Generate, judge and pack the whole emote catalogue for every avatar, avatars in parallel',
  whenToUse: 'Filling or refreshing public/sprites/emotes for several avatars and emotions at once',
  phases: [
    { title: 'Generate', detail: 'concurrency-capped image-to-video batch per avatar via AI Gateway' },
    { title: 'Judge', detail: 'read every contact sheet; pick clip, start and trim per emote' },
    { title: 'Pack', detail: 'chroma key, strip the floor, pixelize, spritesheet, manifest' },
  ],
}

// ---- config -----------------------------------------------------------------
// Relative by default: workflow scripts have no fs access, but subagents run
// with the repo as their cwd. Needs AI_GATEWAY_API_KEY in .env (pnpm loads it).
const REPO = (args && args.repo) || '.'
const ALL_EMOTIONS = [
  'celebrate', 'wave', 'cry', 'walk', 'angry', 'fight', 'defeat', 'love',
  'walk-back', 'walk-right', 'walk-left', 'sad-walk-right', 'sad-walk-left',
]
// Left-facing sheets are never generated: the right-facing clip is mirrored at pack time.
const DERIVED = { 'walk-left': 'walk-right', 'sad-walk-left': 'sad-walk-right' }
const AVATARS = (args && args.avatars) || ['avatar1', 'avatar2', 'avatar3', 'avatar4']
const EMOTIONS = (args && args.emotions) || ALL_EMOTIONS
const SKIP = (args && args.skip) || {} // { avatar2: ['celebrate'] } -- already packed on the new plate
const CONCURRENCY = (args && args.concurrency) || 4 // per avatar; 4 avatars x 4 = 16 Kling jobs at once
const TAG = (args && args.tag) || 'v2'
const MODEL = (args && args.model) || 'klingai/kling-v2.6-i2v'
const MAX_ROUNDS = 2 // one regeneration for the emotes the judge rejected

const unknown = EMOTIONS.filter(e => !ALL_EMOTIONS.includes(e))
if (unknown.length) throw new Error('unknown emotions: ' + unknown.join(', '))

// ---- schemas ----------------------------------------------------------------
const ATTEMPT = {
  type: 'object', required: ['index'],
  properties: {
    index: { type: 'integer' },
    clip: { type: 'string' },
    contact: { type: 'string' },
    genSeconds: { type: 'integer' },
    error: { type: 'string' },
  },
}
const GENERATED = {
  type: 'object', required: ['results'],
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object', required: ['emotion', 'attempts'],
        properties: {
          emotion: { type: 'string' },
          attempts: { type: 'array', items: ATTEMPT },
          defaultTrim: { type: 'number' },
          defaultStart: { type: 'number' },
          loop: { type: 'boolean' },
        },
      },
    },
  },
}
const VERDICTS = {
  type: 'object', required: ['verdicts'],
  properties: {
    verdicts: {
      type: 'array',
      items: {
        type: 'object', required: ['emotion', 'winner', 'startSeconds', 'trimSeconds', 'problems'],
        properties: {
          emotion: { type: 'string' },
          winner: { type: ['integer', 'null'] },
          startSeconds: { type: 'number' },
          trimSeconds: { type: 'number' },
          problems: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
}
const PACKED = {
  type: 'object', required: ['packed'],
  properties: {
    packed: {
      type: 'array',
      items: {
        type: 'object', required: ['emotion', 'src', 'frames', 'bytes'],
        properties: {
          emotion: { type: 'string' },
          src: { type: 'string' },
          frames: { type: 'integer' },
          bytes: { type: 'integer' },
          error: { type: 'string' },
        },
      },
    },
  },
}

// ---- prompts ----------------------------------------------------------------
const generatePrompt = (avatar, emotions, tag) =>
  'From the repo root ' + REPO + ', run this IN THE BACKGROUND (it takes 10-30 minutes):\n' +
  '  pnpm emotes:generate-many --avatar ' + avatar + ' --emotions ' + emotions.join(',') +
  ' --concurrency ' + CONCURRENCY + ' --attempts 1 --tag ' + tag + ' --model ' + MODEL + '\n' +
  'It writes ' + REPO + '/.emotes-work/' + avatar + '/generate-many-' + tag + '.json as it goes. ' +
  'Poll that file (e.g. `sleep 55` then `cat` it, repeatedly -- do not give up before 40 minutes) ' +
  'until it contains `"done": true` (if 40 minutes pass without it, stop waiting and report what the file ' +
  'holds so far). Errors inside attempts (e.g. insufficient balance) are NORMAL data: report them, never give up ' +
  'on the structured result because of them. Then return its `results` object as an ARRAY of ' +
  '{ emotion, attempts, defaultTrim, defaultStart, loop } (one entry per emotion, attempts verbatim: ' +
  'index, clip, contact, genSeconds, or error). Do not judge the clips.'

const judgePrompt = (avatar, results) =>
  'You are judging candidate clips for ' + avatar + ' in a Habbo-style pixel-art room. Use the Read ' +
  'tool on EVERY contact sheet PNG listed below (it shows you the image). A contact sheet shows every ' +
  '2nd frame of a 12 fps clip, 12 cells per row, row-major: cell c (0-based) is at c/6 seconds.\n\n' +
  'For each emotion decide pass/fail:\n' +
  ' 1. identity kept: same hair, clothes and shoes as the first cell in every cell\n' +
  ' 2. the face stays a blank oval (no eyes, nose or mouth drawn in any cell)\n' +
  ' 3. the gesture is legible as the named emotion\n' +
  ' 4. REACTIONS (loop=false: celebrate, wave, cry, walk, angry, fight, defeat, love): the head stays ' +
  'roughly in place and the character is back in the starting pose by the end. ' +
  'trimSeconds = time of the first cell after the gesture where the pose is back, rounded UP to ' +
  '0.5 s, between 2 and 5; startSeconds = 0.\n' +
  ' 5. LOCOMOTION (loop=true: walk-back = seen from behind walking away; walk-left = side view ' +
  'walking left; sad-walk-left / sad-walk-right = side view, head down, a rain cloud above the ' +
  'head): the character must have TURNED to that view and keep walking in it until the end; it ' +
  'must not turn back to the camera. startSeconds = time of the first cell where the turn is ' +
  'complete and the walk is clean, rounded UP to 0.5 s; trimSeconds = 5 (or earlier if it turns back).\n' +
  'winner = the passing attempt index (attempts are usually just [1]); null if it fails. ' +
  'Put the reason in problems. Return one verdict per emotion listed.\n\n' +
  'EMOTIONS:\n' + JSON.stringify(results.map(r => ({
    emotion: r.emotion, loop: !!r.loop, defaultStart: r.defaultStart || 0, defaultTrim: r.defaultTrim,
    attempts: r.attempts.filter(a => a.contact).map(a => ({ index: a.index, contact: a.contact })),
  })))

const packPrompt = (avatar, jobs) =>
  'From the repo root ' + REPO + ', run these commands ONE AFTER ANOTHER (each takes ~15 s):\n' +
  jobs.map(j => j.clip
    ? '  pnpm emotes:pack --avatar ' + avatar + ' --emotion ' + j.emotion + ' --clip ' + j.clip +
      ' --start ' + j.start + ' --trim ' + j.trim + ' --floor strip --model ' + MODEL + (j.mirror ? ' --mirror' : '')
    : '  pnpm emotes:pack --avatar ' + avatar + ' --emotion ' + j.emotion + ' --clip <the newest .mp4 under ' +
      REPO + '/.emotes-work/' + avatar + '/' + j.source + '/ (ls -t)> --floor strip --model ' + MODEL + ' --mirror'
  ).join('\n') +
  '\nEach prints one JSON object; return an array with emotion, src, frames, bytes per command ' +
  '(or emotion + error if one fails). Do not stop at the first failure.'

// ---- run --------------------------------------------------------------------
log('create_emotes: ' + EMOTIONS.length + ' emotions x ' + AVATARS.join(', ') +
  ' (concurrency ' + CONCURRENCY + ' per avatar, tag ' + TAG + ')')

const perAvatar = await pipeline(
  AVATARS,
  async avatar => {
    const wantedAll = EMOTIONS.filter(e => !((SKIP[avatar] || []).includes(e)))
    const wanted = wantedAll.filter(e => !DERIVED[e]) // generated
    const mirrored = wantedAll.filter(e => DERIVED[e]) // packed from a source's clip
    if (!wantedAll.length) return { avatar, packed: [], skipped: [], verdicts: [] }

    const chosen = {} // emotion -> { clip, start, trim }
    const problems = {} // emotion -> last problems
    let pending = wanted
    for (let round = 1; round <= MAX_ROUNDS && pending.length; round++) {
      const tag = round === 1 ? TAG : TAG + 'r' + round
      const generated = await agent(generatePrompt(avatar, pending, tag),
        { label: 'generate:' + avatar + (round > 1 ? ':r' + round : ''), phase: 'Generate', schema: GENERATED })
      const results = (generated ? generated.results : []).filter(r => pending.includes(r.emotion))
      const errored = results.filter(r => !r.attempts.some(a => a.clip && a.contact))
      for (const r of errored) problems[r.emotion] = [(r.attempts.find(a => a.error) || {}).error || 'no clip']
      const judgeable = results.filter(r => r.attempts.some(a => a.clip && a.contact))
      if (judgeable.length) {
        const judged = await agent(judgePrompt(avatar, judgeable),
          { label: 'judge:' + avatar + (round > 1 ? ':r' + round : ''), phase: 'Judge', schema: VERDICTS })
        for (const v of (judged ? judged.verdicts : [])) {
          const r = judgeable.find(x => x.emotion === v.emotion)
          const win = r && v.winner != null ? r.attempts.find(a => a.index === v.winner) : null
          if (win && win.clip) {
            chosen[v.emotion] = { clip: win.clip, start: v.startSeconds || 0, trim: v.trimSeconds || r.defaultTrim || 4 }
          } else {
            problems[v.emotion] = v.problems && v.problems.length ? v.problems : ['rejected']
          }
        }
      }
      pending = wanted.filter(e => !chosen[e])
      if (pending.length) log(avatar + ' round ' + round + ': ' + pending.length + ' to redo (' +
        pending.map(e => e + ': ' + (problems[e] || ['?']).join('; ')).join(' | ') + ')')
    }

    const jobs = Object.entries(chosen).map(([emotion, c]) => ({ emotion, ...c }))
    for (const m of mirrored) {
      // The source may have been chosen in this run or packed earlier: prefer this run's clip,
      // otherwise the pack agent reuses the source's last clip on disk.
      const src = chosen[DERIVED[m]]
      if (src) jobs.push({ emotion: m, ...src, mirror: true })
      else if (!wanted.includes(DERIVED[m])) jobs.push({ emotion: m, clip: null, mirror: true, source: DERIVED[m] })
      else problems[m] = ['source ' + DERIVED[m] + ' was not delivered']
    }
    const missing = wantedAll.filter(e => !jobs.some(j => j.emotion === e))
    let packed = []
    if (jobs.length) {
      const res = await agent(packPrompt(avatar, jobs), { label: 'pack:' + avatar, phase: 'Pack', schema: PACKED })
      packed = res ? res.packed : []
    }
    const delivered = packed.filter(p => p.src && !p.error)
    const notDelivered = wantedAll.filter(e => !delivered.some(p => p.emotion === e))
    log('DELIVERED ' + avatar + ': ' + delivered.map(p => p.emotion).join(', ') +
      (notDelivered.length ? ' | NOT delivered: ' + notDelivered.join(', ') : ''))
    return { avatar, packed: delivered, skipped: notDelivered, problems }
  },
)

const out = perAvatar.filter(Boolean)
// One-shot emotes must be the same length on every avatar (emotes.test.ts
// enforces it): pad the shorter ones from their own clips.
phase('Pack')
const normalized = await agent(
  'From the repo root ' + REPO + ', run `pnpm emotes:normalize` and return its last line verbatim.',
  { label: 'normalize', phase: 'Pack' })
log('normalize: ' + (normalized || '').toString().trim().split('\n').pop())
return {
  delivered: out.map(r => ({ avatar: r.avatar, emotes: r.packed.map(p => p.emotion), bytes: r.packed.reduce((a, p) => a + (p.bytes || 0), 0) })),
  skipped: out.filter(r => r.skipped.length).map(r => ({ avatar: r.avatar, emotes: r.skipped, problems: r.problems })),
  manifest: REPO + '/public/sprites/emotes/manifest.json',
}
