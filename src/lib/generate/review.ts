/**
 * Creative Readiness Score (0–100). A transparent checklist, NOT a platform score and NOT a
 * prediction of views or sales. Every point comes from a rule the user can read in the UI.
 */
import { estimateDuration, fitToDuration, wordCount, DEFAULT_WPM } from "../duration";
import { RULES } from "../platforms";
import type { ContentPlan, MediaAsset, Project, ReadinessCheck, ReadinessReview } from "../types";
import { PLATFORMS } from "../types";
import { deepClone } from "../util";

export const RUBRIC = [
  { id: "hook", label: "Hook is short and clear", max: 15, rule: "Hook of 12 words or fewer gets full points; up to 18 words gets partial." },
  { id: "pacing", label: "Script fits the target length", max: 15, rule: "Estimated speaking time within 1s of target: full; within 20%: partial." },
  { id: "cta", label: "Clear call to action", max: 15, rule: "Last segment contains a CTA and every platform package has one." },
  { id: "accuracy", label: "Grounded in your media and facts", max: 10, rule: "No unverified prices, discounts, scarcity, reviews or results in the copy." },
  { id: "readability", label: "On-screen text is readable", max: 10, rule: "Each on-screen line is 8 words or fewer." },
  { id: "accessibility", label: "Accessibility", max: 10, rule: "Alt text reviewed (photos) or on-screen text supports the spoken words (video)." },
  { id: "platform", label: "Fits each platform's rules", max: 10, rule: "Captions and hashtag counts within each platform's current limits." },
  { id: "media", label: "Media quality", max: 10, rule: "Sharp, well-lit, and vertical for video." },
  { id: "repetition", label: "No repetitive wording", max: 5, rule: "No content word repeated more than 3 times in the spoken script." },
] as const;

const FABRICATION = [
  { re: /\$\s?\d/, why: "a price" },
  { re: /\b\d{1,3}\s?% off\b|\bsale ends\b|\blimited time\b/i, why: "a discount or deadline" },
  { re: /\bonly \d+ left\b|\bselling out\b|\balmost gone\b/i, why: "a scarcity claim" },
  { re: /\b5[- ]star\b|\breviews? say\b|\bcustomers (love|say|rave)\b|\bbest[- ]selling\b/i, why: "a review or popularity claim" },
  { re: /\bguarantee[ds]?\b|\bgo viral\b/i, why: "a guarantee" },
];

export function findUnsupportedClaims(text: string, facts: string): string[] {
  const out: string[] = [];
  for (const f of FABRICATION) {
    const m = text.match(f.re);
    if (m && !facts.toLowerCase().includes(m[0].toLowerCase())) out.push(`"${m[0]}" looks like ${f.why} you haven't confirmed. Remove it or add it to your confirmed facts.`);
  }
  return out;
}

const STOP = new Set("the a an and or but to of in on for with this that it is are was be i you we my your our me at as so just here there what how its it's from up out".split(" "));

export function reviewPlan(plan: ContentPlan, project: Project, assets: MediaAsset[]): ReadinessReview {
  const checks: ReadinessCheck[] = [];
  const suggestions: string[] = [];
  const isPhotoOnly = project.singlePictureMode === "photo";
  const add = (id: string, points: number, tip?: string) => {
    const r = RUBRIC.find((x) => x.id === id)!;
    checks.push({ id, label: r.label, points: Math.round(points), max: r.max, tip });
    if (tip && points < r.max) suggestions.push(tip);
  };

  const hook = plan.hooks[plan.recommendedHook.index]?.text ?? plan.segments[0]?.spoken ?? "";
  const hw = wordCount(hook);
  add("hook", hw === 0 ? 0 : hw <= 12 ? 15 : hw <= 18 ? 9 : 4,
    hw > 12 ? `Your hook is ${hw} words. Cut it to 12 or fewer so it lands in the first two seconds.` : undefined);

  const est = estimateDuration(plan.segments, project.speakingRateWpm || DEFAULT_WPM);
  if (isPhotoOnly) add("pacing", 15);
  else {
    const over = est.totalSec - plan.targetDurationSec;
    add("pacing", over <= 1 ? 15 : over <= plan.targetDurationSec * 0.2 ? 8 : 3,
      over > 1 ? `The script runs about ${est.totalSec.toFixed(0)}s for a ${plan.targetDurationSec}s target. Tap "Make shorter" or remove a line.` : undefined);
  }

  const last = plan.segments[plan.segments.length - 1];
  const hasCta = Boolean(last && (last.spoken + last.onScreen).trim()) && PLATFORMS.every((p) => plan.packages[p]?.cta?.trim());
  add("cta", hasCta ? 15 : 5, hasCta ? undefined : "End with a clear next step (quote, DM, website).");

  const allText = [
    ...plan.segments.flatMap((s) => [s.spoken, s.onScreen]),
    ...PLATFORMS.flatMap((p) => [plan.packages[p].caption, plan.packages[p].shortCaption, plan.packages[p].coverHeadline]),
    ...(plan.photo?.captions ?? []),
  ].join("\n");
  const rejected = findUnsupportedClaims(allText, `${project.facts} ${project.idea}`);
  add("accuracy", rejected.length ? Math.max(0, 10 - rejected.length * 4) : 10, rejected[0]);

  const longLines = plan.segments.filter((s) => wordCount(s.onScreen) > 8);
  add("readability", longLines.length ? Math.max(3, 10 - longLines.length * 3) : 10,
    longLines.length ? `Shorten on-screen text in "${longLines[0].label}" to 8 words or fewer.` : undefined);

  if (plan.photo) {
    const reviewed = plan.photo.altText && !plan.photo.altText.includes("(Please review");
    add("accessibility", reviewed ? 10 : 5, reviewed ? undefined : "Review the alt text and describe colors, text and setting.");
  } else {
    const supported = plan.segments.filter((s) => s.spoken.trim()).every((s) => s.onScreen.trim());
    add("accessibility", supported ? 10 : 6, supported ? undefined : "Add on-screen text to every spoken segment so people watching muted can follow.");
  }

  const platformIssues: string[] = [];
  for (const p of PLATFORMS) {
    const pkg = plan.packages[p];
    if (!project.platforms.includes(p)) continue;
    const full = pkg.caption + " " + pkg.hashtags.map((h) => h.tag).join(" ");
    if (full.length > RULES[p].captionMax) platformIssues.push(`${p} caption is too long`);
    if (pkg.hashtags.length > RULES[p].hashtagMax) platformIssues.push(`${p} has ${pkg.hashtags.length} hashtags (max ${RULES[p].hashtagMax})`);
  }
  add("platform", platformIssues.length ? 4 : 10, platformIssues.length ? `Fix: ${platformIssues.join("; ")}.` : undefined);

  const techs = assets.map((a) => a.tech).filter(Boolean) as NonNullable<MediaAsset["tech"]>[];
  if (!techs.length) add("media", 7);
  else {
    let pts = 10;
    const tips: string[] = [];
    const avgSharp = techs.reduce((s, t) => s + t.sharpness, 0) / techs.length;
    const avgBright = techs.reduce((s, t) => s + t.brightness, 0) / techs.length;
    if (avgSharp < 25) { pts -= 4; tips.push("media looks soft — reshoot with focus locked or use your sharpest take"); }
    if (avgBright < 25) { pts -= 3; tips.push("media is dark — add light or brighten"); }
    if (avgBright > 88) { pts -= 2; tips.push("media is very bright — check for blown highlights"); }
    const horiz = assets.filter((a) => a.kind === "video" && a.tech?.orientation === "horizontal");
    if (horiz.length && !isPhotoOnly) { pts -= 3; tips.push("horizontal video needs cropping to 9:16"); }
    add("media", Math.max(0, pts), tips.length ? cap(tips.join("; ")) + "." : undefined);
  }

  const words = plan.segments.map((s) => s.spoken).join(" ").toLowerCase().match(/[a-z']+/g) ?? [];
  const counts: Record<string, number> = {};
  for (const w of words) if (!STOP.has(w) && w.length > 2) counts[w] = (counts[w] ?? 0) + 1;
  const rep = Object.entries(counts).filter(([, n]) => n > 3).map(([w]) => w);
  add("repetition", rep.length ? 2 : 5, rep.length ? `"${rep[0]}" repeats ${counts[rep[0]]} times — vary the wording.` : undefined);

  const score = checks.reduce((s, c) => s + c.points, 0);
  const pct = (id: string) => { const c = checks.find((x) => x.id === id)!; return c.points / c.max; };
  const reachRaw = (pct("hook") + pct("media") + pct("pacing")) / 3;
  const salesRaw = (pct("cta") + pct("accuracy") + (["custom_orders", "bulk_buyers", "leads", "website", "bookings", "new_product"].includes(project.objective) ? 1 : 0.6)) / 3;
  const level = (x: number) => (x >= 0.85 ? "Strong" : x >= 0.6 ? "Moderate" : "Limited") as "Strong" | "Moderate" | "Limited";
  return {
    score,
    checks,
    reach: { level: level(reachRaw), why: reachRaw >= 0.85 ? "Short, clear hook on good-quality media at a sensible length." : "Hook length, media quality or pacing could be tighter — see suggestions." },
    sales: { level: level(salesRaw), why: salesRaw >= 0.85 ? "Clear next step that matches your goal, with no unverified claims." : "A clearer CTA or removing unverified claims would help buyers act." },
    suggestions,
    rejected,
  };
}

function cap(s: string) { return s ? s[0].toUpperCase() + s.slice(1) : s; }

/**
 * "Improve my post": applies the fixes it can make safely and deterministically.
 * Sections the user edited or approved are never touched — those get a suggestion instead.
 */
export function improvePlan(plan: ContentPlan, project: Project): { plan: ContentPlan; changes: string[]; skipped: string[] } {
  const out = deepClone(plan);
  const changes: string[] = [];
  const skipped: string[] = [];
  const wpm = project.speakingRateWpm || DEFAULT_WPM;
  const locked = project.locked;

  const est = estimateDuration(out.segments, wpm).totalSec;
  if (project.singlePictureMode !== "photo" && est > out.targetDurationSec + 1) {
    if (locked.script) skipped.push("Script is over length, but you edited it — shorten it yourself or unlock it.");
    else { out.segments = fitToDuration(out.segments, out.targetDurationSec, wpm); changes.push(`Shortened the script to fit ${out.targetDurationSec}s.`); }
  }
  for (const s of out.segments) {
    if (wordCount(s.onScreen) > 8) {
      if (locked.script) { skipped.push(`On-screen text in "${s.label}" is long (script is locked).`); continue; }
      s.onScreen = s.onScreen.split(/\s+/).slice(0, 7).join(" ") + "…";
      changes.push(`Trimmed on-screen text in "${s.label}".`);
    }
  }
  for (const p of PLATFORMS) {
    const key = `pkg.${p}.hashtags` as const;
    const max = RULES[p].hashtagMax;
    if (out.packages[p].hashtags.length > max) {
      if (locked[key]) skipped.push(`${p} hashtags exceed ${max} (you edited them).`);
      else { out.packages[p].hashtags = out.packages[p].hashtags.slice(0, max); changes.push(`Cut ${p} hashtags to ${max}.`); }
    }
  }
  const hook = out.hooks[out.recommendedHook.index];
  if (hook && wordCount(hook.text) > 12) {
    if (locked.hooks) skipped.push("Hook is long, but you edited it.");
    else {
      const shorter = out.hooks.map((h, i) => ({ i, n: wordCount(h.text) })).filter((x) => x.n <= 12).sort((a, b) => a.n - b.n)[0];
      if (shorter) { out.recommendedHook = { index: shorter.i, reason: "Switched to a shorter hook that lands in under two seconds." }; changes.push("Switched to a shorter hook."); }
    }
  }
  return { plan: out, changes, skipped };
}
