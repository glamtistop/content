import type { ScriptSegment } from "./types";

export const DEFAULT_WPM = 150; // conversational short-form pace
export const END_CARD_SEC = 1.5;
export const TRANSITION_SEC = 0.3;

export function wordCount(s: string): number {
  return (s.trim().match(/[A-Za-z0-9'’$%.-]+/g) ?? []).filter((w) => /[A-Za-z0-9]/.test(w)).length;
}

/** Explicit pauses written into the script: "...", "—", or "[pause]" / "(pause 1s)". */
export function pauseSeconds(s: string): number {
  let t = 0;
  t += (s.match(/\.\.\.|…/g) ?? []).length * 0.5;
  t += (s.match(/ — | -- /g) ?? []).length * 0.25;
  for (const m of s.matchAll(/[[(]pause(?:\s+(\d+(?:\.\d+)?)\s*s)?[\])]/gi)) t += m[1] ? parseFloat(m[1]) : 0.75;
  // sentence boundaries add a short natural breath
  t += Math.max(0, (s.match(/[.!?](\s|$)/g) ?? []).length - 1) * 0.2;
  return t;
}

export interface SegmentTiming { id: string; speakSec: number; pauseSec: number; demoSec: number; totalSec: number; words: number }
export interface DurationEstimate { totalSec: number; words: number; segments: SegmentTiming[]; breakdown: { speaking: number; pauses: number; demos: number; transitions: number; endCard: number } }

export function estimateDuration(segments: ScriptSegment[], wpm = DEFAULT_WPM, opts: { endCard?: boolean } = {}): DurationEstimate {
  const seg = segments.map((s) => {
    const words = wordCount(s.spoken);
    const speakSec = (words / wpm) * 60;
    const pauseSec = pauseSeconds(s.spoken);
    // a silent segment still needs time on screen to be read/seen
    const minOnScreen = !s.spoken.trim() ? Math.max(1.5, wordCount(s.onScreen) * 0.35) : 0;
    const demoSec = Math.max(s.demoSec || 0, minOnScreen);
    return { id: s.id, words, speakSec, pauseSec, demoSec, totalSec: speakSec + pauseSec + demoSec };
  });
  const transitions = Math.max(0, segments.length - 1) * TRANSITION_SEC;
  const endCard = opts.endCard === false ? 0 : END_CARD_SEC;
  const speaking = seg.reduce((a, s) => a + s.speakSec, 0);
  const pauses = seg.reduce((a, s) => a + s.pauseSec, 0);
  const demos = seg.reduce((a, s) => a + s.demoSec, 0);
  return {
    totalSec: speaking + pauses + demos + transitions + endCard,
    words: seg.reduce((a, s) => a + s.words, 0),
    segments: seg,
    breakdown: { speaking, pauses, demos, transitions, endCard },
  };
}

/** Max spoken words that fit in a target, given the non-speech time already planned. */
export function wordBudget(segments: ScriptSegment[], targetSec: number, wpm = DEFAULT_WPM) {
  const est = estimateDuration(segments, wpm);
  const nonSpeech = est.totalSec - est.breakdown.speaking;
  return Math.max(0, Math.floor(((targetSec - nonSpeech) / 60) * wpm));
}

function splitSentences(s: string) {
  return s.match(/[^.!?]+[.!?]+["’”]?\s*|[^.!?]+$/g)?.map((x) => x.trim()).filter(Boolean) ?? [];
}

/**
 * Deterministic shortener used when no AI is available (and as a safety net after AI rewrites):
 * removes whole sentences from middle segments first, never the hook (first) or CTA (last).
 * Returns new segments; never mutates input.
 */
export function fitToDuration(segments: ScriptSegment[], targetSec: number, wpm = DEFAULT_WPM): ScriptSegment[] {
  const out = segments.map((s) => ({ ...s }));
  const tooLong = () => estimateDuration(out, wpm).totalSec > targetSec + 0.25;
  const order = out.map((_, i) => i).filter((i) => i !== 0 && i !== out.length - 1);
  // longest middle segments first
  order.sort((a, b) => wordCount(out[b].spoken) - wordCount(out[a].spoken));
  for (const i of order) {
    while (tooLong()) {
      const sents = splitSentences(out[i].spoken);
      if (sents.length <= 1) break;
      sents.splice(sents.length - 1, 1);
      out[i].spoken = sents.join(" ");
    }
    if (!tooLong()) break;
  }
  // then trim demo time down to a 1s floor
  for (const s of out) {
    while (tooLong() && s.demoSec > 1) s.demoSec = Math.max(1, s.demoSec - 0.5);
  }
  // then drop whole middle segments
  // (keep at least hook, one body scene and the CTA)
  while (tooLong() && out.length > 3) out.splice(Math.floor(out.length / 2), 1);
  // last resort: keep only the first sentence of the hook and the last sentence of the CTA
  if (tooLong() && out.length) {
    const h = splitSentences(out[0].spoken);
    if (h.length > 1) out[0].spoken = h[0];
    const last = out[out.length - 1];
    const c = splitSentences(last.spoken);
    if (out.length > 1 && tooLong() && c.length > 1) last.spoken = c[c.length - 1];
  }
  return out;
}

export function spokenScript(segments: ScriptSegment[]) {
  return segments.map((s) => s.spoken.trim()).filter(Boolean).join(" ");
}
