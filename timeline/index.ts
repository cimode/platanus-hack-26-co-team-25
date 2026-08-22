/**
 * timeline/index.ts — the timeline layer's public entry point.
 *
 * LOCKED DECISION (2026-08-22, post model-off): the product ships APPROACH B
 * (grammar hybrid) as the default generator. Narration model chain:
 * moonshotai/kimi-k2.5 -> deepseek/deepseek-v4-pro -> zai/glm-4.7-flash ->
 * deterministic mock. Approach A stays available as the hard fallback and
 * approach C's validator remains the output gate (see COMPARISON.md).
 */

export { generateTimeline as default } from './approach-b/index.ts';

export { generateTimeline as generateTimelineA } from './approach-a/index.ts';
export { generateTimeline as generateTimelineB } from './approach-b/index.ts';
export { generateTimeline as generateTimelineC } from './approach-c/index.ts';
