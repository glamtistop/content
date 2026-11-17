/**
 * Evolving memory (feature 5).
 *
 * 1. diffPlans: turns the user's edits into field-level decisions (what changed, where).
 * 2. learnRules: finds repeated patterns in those decisions with plain, explainable detectors
 *    (no AI needed), weighted so older decisions count less (half-life 90 days).
 * 3. applyMemory: applies the user's ACTIVE rules to a fresh draft and reports what it applied.
 *
 * Only decisions the user actually made are stored. Rules are suggestions until they have
 * enough consistent evidence, and the user can switch any rule off.
 */
import { fitToDuration, DEFAULT_WPM } from "./duration";
import { RULES } from "./platforms";
import type {
  ContentPlan, DecisionEvent, MemoryField, Platform, PreferenceRule, ReasonCode, RuleKind,
} from "./types";
import { PLATFORM_LABEL } from "./types";
import { deepClone, uid } from "./util";

// ---------------------------------------------------------------- field extraction & diff

export interface FieldText { path: string; field: MemoryField; platform?: Platform; text: string }

export function planFields(plan: ContentPlan, platforms: Platform[]): FieldText[] {
  const out: FieldText[] = [];
  plan.hooks.forEach((h, i) => out.push({ path: `hooks.${i}`, field: "hook", text: h.text }));
  for (const s of plan.segments) {
    out.push({ path: `seg.${s.id}.spoken`, field: "spoken", text: s.spoken });
    out.push({ path: `seg.${s.id}.onScreen`, field: "onScreen", text: s.onScreen });
  }
  out.push({ path: "shortScript", field: "shortScript", text: plan.shortScript });
  for (const p of platforms) {
    const k = plan.packages[p];
    if (!k) continue;
    out.push({ path: `pkg.${p}.caption`, field: "caption", platform: p, text: k.caption });
    out.push({ path: `pkg.${p}.shortCaption`, field: "shortCaption", platform: p, text: k.shortCaption });
    out.push({ path: `pkg.${p}.hashtags`, field: "hashtags", platform: p, text: k.hashtags.map((h) => h.tag).join(" ") });
    out.push({ path: `pkg.${p}.cta`, field: "cta", platform: p, text: k.cta });
    out.push({ path: `pkg.${p}.coverHeadline`, field: "coverHeadline", platform: p, text: k.coverHeadline });
  }
  if (plan.photo) {
    plan.photo.captions.forEach((c, i) => out.push({ path: `photo.captions.${i}`, field: "photoCaption", text: c }));
    out.push({ path: "photo.headline", field: "headline", text: plan.photo.headline });
    out.push({ path: "photo.altText", field: "altText", text: plan.photo.altText });
  }
  return out;
}

export interface FieldChange { kind: "edit" | "cut"; field: MemoryField; platform?: Platform; before: string; after: string }

/** Field-level changes between two versions of a plan. A scene that disappears is a "cut". */
export function diffPlans(before: ContentPlan, after: ContentPlan, platforms: Platform[]): FieldChange[] {
  const a = new Map(planFields(after, platforms).map((f) => [f.path, f]));
  const out: FieldChange[] = [];
  const seen = new Set<string>();
  for (const f of planFields(before, platforms)) {
    seen.add(f.path);
    const g = a.get(f.path);
    if (!g) {
      if (f.text.trim()) out.push({ kind: "cut", field: f.field, platform: f.platform, before: f.text, after: "" });
      continue;
    }
    if (norm(f.text) !== norm(g.text)) out.push({ kind: "edit", field: f.field, platform: f.platform, before: f.text, after: g.text });
  }
  for (const [path, g] of a) {
    if (!seen.has(path) && g.text.trim()) out.push({ kind: "edit", field: g.field, platform: g.platform, before: "", after: g.text });
  }
  return out;
}

// ---------------------------------------------------------------- text helpers

export const norm = (s: string) => s.toLowerCase().replace(/[’']/g, "'").replace(/[^\p{L}\p{N}'#@ ]+/gu, " ").replace(/\s+/g, " ").trim();
const EMOJI = /\p{Extended_Pictographic}/gu;
export const countEmoji = (s: string) => (s.match(EMOJI) ?? []).length;
export const stripEmoji = (s: string) => s.replace(/\p{Extended_Pictographic}(️|‍\p{Extended_Pictographic})*/gu, "").replace(/[ \t]{2,}/g, " ").replace(/ +([.,!?])/g, "$1").trim();
const sentences = (s: string) => s.match(/[^.!?\n]+[.!?]+["”’]?|[^.!?\n]+$/gm)?.map((x) => x.trim()).filter(Boolean) ?? [];

const STOP = new Set(("a an the and or but to of in on for with this that it is are was be i you we my your our me at as so just " +
  "here there what how its it's from up out by if into than then them they he she his her their not no yes do does did " +
  "can will would could should have has had am im i'm you're we're").split(" "));

function words(s: string) { return norm(s).split(" ").filter((w) => w && !w.startsWith("#")); }

/** 2–4 word phrases that carry meaning (not all stop words, not just numbers). */
export function phrases(s: string): Set<string> {
  const w = words(s);
  const out = new Set<string>();
  for (let n = 2; n <= 4; n++) {
    for (let i = 0; i + n <= w.length; i++) {
      const g = w.slice(i, i + n);
      if (g.every((x) => STOP.has(x) || /^\d+$/.test(x))) continue;
      if (STOP.has(g[0]) && STOP.has(g[g.length - 1])) continue;
      out.add(g.join(" "));
    }
  }
  return out;
}

const opener = (s: string) => words(s).slice(0, 3).join(" ");
const containsPhrase = (text: string, phrase: string) => ` ${norm(text)} `.includes(` ${phrase} `);

const FIELD_LABEL: Record<string, string> = {
  hook: "hooks", spoken: "spoken lines", onScreen: "on-screen text", caption: "captions", shortCaption: "short captions",
  hashtags: "hashtags", cta: "calls to action", coverHeadline: "cover headlines", shortScript: "short scripts",
  photoCaption: "photo captions", headline: "headlines", altText: "alt text", "*": "drafts",
};
const where = (field: string, platform?: string) =>
  `${platform && platform !== "*" ? PLATFORM_LABEL[platform as Platform] + " " : ""}${FIELD_LABEL[field] ?? field}`;

const TEXT_FIELDS: MemoryField[] = ["hook", "spoken", "onScreen", "caption", "shortCaption", "coverHeadline", "shortScript", "photoCaption", "headline"];

// ---------------------------------------------------------------- learning

export const HALF_LIFE_DAYS = 90;
export const weightOf = (at: string, now: Date) => 0.5 ** (Math.max(0, now.getTime() - Date.parse(at)) / 86400000 / HALF_LIFE_DAYS);

interface Cand {
  key: string; kind: RuleKind; scope: PreferenceRule["scope"]; text: string;
  params: PreferenceRule["params"]; minEvents: number; minProjects: number;
  ev: Map<string, number>; counter: Map<string, number>; projects: Set<string>; ratios: number[]; lastSeen: string;
}

const REASON_RULES: Partial<Record<ReasonCode, { key: string; kind: RuleKind; text: string; params: PreferenceRule["params"] }>> = {
  too_long: { key: "length|reason|*|*", kind: "length", text: "Keep drafts shorter (you've said \"too long\")", params: { maxRatio: 0.8 } },
  too_salesy: { key: "tone|less_salesy", kind: "tone", text: "Less salesy: softer, fewer pushy lines", params: { tone: "less_salesy" } },
  not_my_voice: { key: "tone|voice", kind: "tone", text: "Match your own voice more closely (lean on your preferred versions)", params: { tone: "voice" } },
  too_generic: { key: "tone|specific", kind: "tone", text: "Be more specific about the product and who it's for", params: { tone: "specific" } },
  cringe: { key: "tone|no_hype", kind: "tone", text: "No hype or trendy slang", params: { tone: "no_hype" } },
  wrong_facts: { key: "tone|facts", kind: "tone", text: "Stick strictly to facts you've confirmed", params: { tone: "facts" } },
};

export function learnRules(events: DecisionEvent[], existing: PreferenceRule[], brandId: string, now = new Date()): { rules: PreferenceRule[]; removedIds: string[] } {
  const cands = new Map<string, Cand>();
  const cand = (key: string, init: Omit<Cand, "key" | "ev" | "counter" | "projects" | "ratios" | "lastSeen">) => {
    let c = cands.get(key);
    if (!c) { c = { key, ...init, ev: new Map(), counter: new Map(), projects: new Set(), ratios: [], lastSeen: "" }; cands.set(key, c); }
    return c;
  };
  const hit = (c: Cand, e: DecisionEvent, counter = false) => {
    const w = weightOf(e.at, now);
    (counter ? c.counter : c.ev).set(e.id, w);
    if (!counter) {
      if (e.projectId) c.projects.add(e.projectId);
      if (e.at > c.lastSeen) c.lastSeen = e.at;
    }
  };
  const removedPh = new Map<string, DecisionEvent[]>();
  const addedPh = new Map<string, DecisionEvent[]>();

  for (const e of events) {
    const plat: Platform | "*" = e.platform ?? "*";
    // explicit reasons the user picked
    for (const r of e.reasons) {
      const spec = REASON_RULES[r];
      if (spec) hit(cand(spec.key, { kind: spec.kind, scope: { agent: "writer", field: "*", platform: "*" }, text: spec.text, params: spec.params, minEvents: 2, minProjects: 1 }), e);
    }
    // explicit hook rejections apply right away
    if (e.kind === "reject" && e.field === "hook" && e.before.trim()) {
      hit(cand(`rejected_hook|${norm(e.before)}`, { kind: "rejected_hook", scope: { agent: "writer", field: "hook", platform: "*" }, text: `Don't reuse the hook "${e.before.trim()}"`, params: { hook: e.before.trim() }, minEvents: 1, minProjects: 1 }), e);
      if (e.context.style) hit(cand(`hook_style|${e.context.style}`, { kind: "hook_style", scope: { agent: "writer", field: "hook", platform: "*" }, text: `Fewer "${e.context.style}" hooks`, params: { style: e.context.style }, minEvents: 3, minProjects: 1 }), e);
    }
    if ((e.kind === "reject" || e.kind === "regenerate") && e.field === "hook" && e.before.trim()) {
      const o = opener(e.before);
      if (o.split(" ").length >= 2) hit(cand(`opener|${o}`, { kind: "avoid_phrase", scope: { agent: "writer", field: "hook", platform: "*" }, text: `Don't open hooks with "${o}…"`, params: { phrase: o, position: "start" }, minEvents: 2, minProjects: 1 }), e);
    }
    if (e.kind !== "edit" && e.kind !== "cut") continue;

    if (e.field === "hashtags") {
      const b = new Set(e.before.split(/\s+/).filter(Boolean).map((t) => t.toLowerCase()));
      const a = new Set(e.after.split(/\s+/).filter(Boolean).map((t) => t.toLowerCase()));
      for (const t of b) if (!a.has(t)) hit(cand(`avoid_tag|${t}`, { kind: "avoid_tag", scope: { agent: "writer", field: "hashtags", platform: "*" }, text: `Don't use ${t}`, params: { tag: t }, minEvents: 2, minProjects: 2 }), e);
      for (const t of a) if (!b.has(t)) hit(cand(`prefer_tag|${t}`, { kind: "prefer_tag", scope: { agent: "writer", field: "hashtags", platform: "*" }, text: `Include ${t}`, params: { tag: t }, minEvents: 2, minProjects: 2 }), e);
      for (const t of a) if (!b.has(t)) { const c = cands.get(`avoid_tag|${t}`); if (c) hit(c, e, true); }
      continue;
    }
    if (e.field === "cta" && e.after.trim()) {
      hit(cand(`cta|${norm(e.after)}`, { kind: "cta", scope: { agent: "writer", field: "cta", platform: "*" }, text: `Prefer the call to action "${e.after.trim()}"`, params: { cta: e.after.trim() }, minEvents: 2, minProjects: 1 }), e);
      continue;
    }
    if (!TEXT_FIELDS.includes(e.field)) continue;

    if (e.kind === "edit" && e.before.trim() && e.after.trim()) {
      const be = countEmoji(e.before), ae = countEmoji(e.after);
      const emojiKey = `emoji|${e.field}|${plat}`;
      const emojiInit = { kind: "emoji" as RuleKind, scope: { agent: "writer" as const, field: e.field, platform: plat }, text: `No emojis in ${where(e.field, plat)}`, params: { allow: false }, minEvents: 3, minProjects: 1 };
      if (be > 0 && ae === 0) hit(cand(emojiKey, emojiInit), e);
      else if (ae > be) hit(cand(emojiKey, emojiInit), e, true);

      const bx = (e.before.match(/!/g) ?? []).length, ax = (e.after.match(/!/g) ?? []).length;
      const pKey = `punct|exclaim|${e.field}|${plat}`;
      const pInit = { kind: "punctuation" as RuleKind, scope: { agent: "writer" as const, field: e.field, platform: plat }, text: `Fewer exclamation marks in ${where(e.field, plat)}`, params: { exclaim: false }, minEvents: 3, minProjects: 1 };
      if (bx > 0 && ax < bx) hit(cand(pKey, pInit), e);
      else if (ax > bx) hit(cand(pKey, pInit), e, true);

      if (e.before.length >= 40) {
        const r = e.after.length / e.before.length;
        const lKey = `length|${e.field}|${plat}`;
        const lInit = { kind: "length" as RuleKind, scope: { agent: "writer" as const, field: e.field, platform: plat }, text: "", params: {}, minEvents: 3, minProjects: 1 };
        if (r < 0.85) { const c = cand(lKey, lInit); hit(c, e); c.ratios.push(r); }
        else if (r > 1.15) hit(cand(lKey, lInit), e, true);
      }
    }
    const bp = phrases(e.before), ap = phrases(e.after);
    for (const g of bp) if (!ap.has(g)) removedPh.set(g, [...(removedPh.get(g) ?? []), e]);
    for (const g of ap) if (!bp.has(g)) addedPh.set(g, [...(addedPh.get(g) ?? []), e]);
  }

  // phrase rules: keep the shortest phrase that explains the same decisions
  const phraseRules = (m: Map<string, DecisionEvent[]>, other: Map<string, DecisionEvent[]>, kind: "avoid_phrase" | "prefer_phrase") => {
    const strong = [...m.entries()].filter(([, es]) => es.length >= 3 && new Set(es.map((e) => e.projectId)).size >= 2);
    const kept = strong.filter(([g, es]) => !strong.some(([h, hs]) => h !== g && h.length < g.length && ` ${g} `.includes(` ${h} `) && hs.length >= es.length));
    for (const [g, es] of kept) {
      const c = cand(`${kind}|${g}`, { kind, scope: { agent: "writer", field: "*", platform: "*" }, text: kind === "avoid_phrase" ? `Avoid "${g}"` : `Use phrases like "${g}"`, params: { phrase: g }, minEvents: 3, minProjects: 2 });
      for (const e of es) hit(c, e);
      for (const e of other.get(g) ?? []) hit(c, e, true);
    }
  };
  phraseRules(removedPh, addedPh, "avoid_phrase");
  phraseRules(addedPh, removedPh, "prefer_phrase");

  // finish length rules
  for (const c of cands.values()) {
    if (c.kind === "length" && c.ratios.length) {
      const sorted = [...c.ratios].sort((a, b) => a - b);
      const med = sorted[Math.floor(sorted.length / 2)];
      const ratio = Math.max(0.4, Math.round(med * 20) / 20);
      c.params = { maxRatio: ratio };
      c.text = `Keep ${where(c.scope.field, c.scope.platform)} about ${Math.round((1 - ratio) * 100)}% shorter`;
    }
  }

  const byKey = new Map(existing.map((r) => [r.key, r]));
  const t = now.toISOString();
  const rules: PreferenceRule[] = [];
  for (const c of cands.values()) {
    const evidence = round1([...c.ev.values()].reduce((a, b) => a + b, 0));
    const counter = round1([...c.counter.values()].reduce((a, b) => a + b, 0));
    if (c.ev.size === 0) continue;
    const enoughProjects = c.minProjects <= 1 || c.projects.size >= c.minProjects;
    // older decisions count less: a pattern must still carry enough recent weight (explicit hook rejections don't fade)
    const fresh = c.kind === "rejected_hook" || evidence >= c.minEvents * 0.6;
    const ready = c.ev.size >= c.minEvents && enoughProjects && fresh && evidence >= 2 * counter;
    const prev = byKey.get(c.key);
    rules.push({
      id: prev?.id ?? uid(),
      brandId,
      key: c.key,
      kind: c.kind,
      scope: c.scope,
      text: prev?.userSet ? prev.text : c.text,
      params: c.params,
      evidence, counter, events: c.ev.size,
      status: prev?.userSet ? prev.status : ready ? "active" : "suggested",
      userSet: prev?.userSet ?? false,
      lastSeen: c.lastSeen || t,
      createdAt: prev?.createdAt ?? t,
      updatedAt: t,
    });
    byKey.delete(c.key);
  }
  const removedIds: string[] = [];
  for (const r of byKey.values()) {
    if (r.userSet) rules.push(r);
    else removedIds.push(r.id);
  }
  return { rules, removedIds };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

// ---------------------------------------------------------------- applying

const applies = (r: PreferenceRule, field: MemoryField, platform?: Platform) =>
  (r.scope.field === "*" || r.scope.field === field) && (r.scope.platform === "*" || !platform || r.scope.platform === platform);

export function activeRules(rules: PreferenceRule[]) {
  return rules.filter((r) => r.status === "active");
}

/** Hooks the user rejected or whose opening they keep rejecting. Used by the template writer. */
export function hookAvoider(rules: PreferenceRule[]) {
  const act = activeRules(rules);
  const rejected = new Set(act.filter((r) => r.kind === "rejected_hook").map((r) => norm(String(r.params.hook))));
  const openers = act.filter((r) => r.kind === "avoid_phrase" && r.params.position === "start").map((r) => String(r.params.phrase));
  const phrasesAvoided = act.filter((r) => r.kind === "avoid_phrase" && r.params.position !== "start").map((r) => String(r.params.phrase));
  const styles = new Set(act.filter((r) => r.kind === "hook_style").map((r) => String(r.params.style)));
  return {
    isAvoided: (text: string) => {
      const n = norm(text);
      return rejected.has(n) || openers.some((o) => n.startsWith(o)) || phrasesAvoided.some((p) => containsPhrase(text, p));
    },
    avoidsStyle: (style: string) => styles.has(style),
  };
}

export function preferredCta(rules: PreferenceRule[], available: string[]) {
  const ctas = activeRules(rules).filter((r) => r.kind === "cta").sort((a, b) => b.evidence - a.evidence);
  for (const r of ctas) {
    const m = available.find((c) => norm(c) === norm(String(r.params.cta)));
    if (m) return m;
  }
  return undefined;
}

/**
 * Applies the user's active rules to a draft. Returns the new plan and, in plain words,
 * which preferences changed something. `fallbackHooks` replace hooks the user rejected.
 */
export function applyMemory(plan: ContentPlan, rules: PreferenceRule[], platforms: Platform[], opts: { fallbackHooks?: { text: string; style: string }[]; wpm?: number; photoOnly?: boolean } = {}): { plan: ContentPlan; applied: string[] } {
  const act = activeRules(rules);
  const out = deepClone(plan);
  const applied = new Set<string>();
  if (!act.length) return { plan: out, applied: [] };

  const textRule = (field: MemoryField, platform: Platform | undefined, text: string) => {
    let t = text;
    for (const r of act) {
      if (!applies(r, field, platform) || !t) continue;
      const before = t;
      if (r.kind === "emoji" && r.params.allow === false) t = stripEmoji(t);
      else if (r.kind === "punctuation" && r.params.exclaim === false) t = t.replace(/!+/g, ".").replace(/\.\.+/g, ".");
      else if (r.kind === "avoid_phrase" && r.params.position !== "start" && field !== "hook") {
        const phrase = String(r.params.phrase);
        const ss = sentences(t);
        if (ss.length > 1 && ss.some((s) => containsPhrase(s, phrase))) {
          const kept = ss.filter((s) => !containsPhrase(s, phrase));
          if (kept.length) t = kept.join(" ");
        }
      } else if (r.kind === "length" && r.scope.field !== "*" && ["caption", "shortCaption", "photoCaption"].includes(field)) {
        t = shortenSentences(t, Number(r.params.maxRatio));
      }
      if (t !== before) applied.add(r.text);
    }
    return t;
  };

  // hooks
  const avoid = hookAvoider(rules);
  const fallbacks = (opts.fallbackHooks ?? []).filter((h) => !avoid.isAvoided(h.text));
  out.hooks = out.hooks.map((h) => {
    if (!avoid.isAvoided(h.text)) return { ...h, text: textRule("hook", undefined, h.text) };
    const alt = fallbacks.find((f) => !out.hooks.some((x) => norm(x.text) === norm(f.text)));
    if (alt) {
      fallbacks.splice(fallbacks.indexOf(alt), 1);
      applied.add("Skipped hooks you've rejected before");
      const oldText = h.text;
      for (const s of out.segments) if (norm(s.spoken) === norm(oldText)) s.spoken = alt.text;
      return alt;
    }
    return h;
  });

  // script
  for (const s of out.segments) {
    s.spoken = textRule("spoken", undefined, s.spoken);
    s.onScreen = textRule("onScreen", undefined, s.onScreen);
  }
  out.shortScript = textRule("shortScript", undefined, out.shortScript);
  const lenRule = act.find((r) => r.kind === "length" && (r.scope.field === "spoken" || r.scope.field === "*"));
  if (lenRule && !opts.photoOnly && out.segments.length) {
    const target = Math.max(5, Math.round(out.targetDurationSec * Number(lenRule.params.maxRatio || 0.8)));
    if (target < out.targetDurationSec) {
      out.targetDurationSec = target;
      out.segments = fitToDuration(out.segments, target, opts.wpm ?? DEFAULT_WPM);
      applied.add(lenRule.text);
    }
  }

  // packages
  for (const p of platforms) {
    const k = out.packages[p];
    if (!k) continue;
    k.caption = textRule("caption", p, k.caption);
    k.shortCaption = textRule("shortCaption", p, k.shortCaption);
    k.coverHeadline = textRule("coverHeadline", p, k.coverHeadline);
    k.onScreenText = k.onScreenText.map((t) => textRule("onScreen", p, t));
    const max = RULES[p].hashtagMax;
    for (const r of act) {
      if (r.kind === "avoid_tag") {
        const n = k.hashtags.length;
        k.hashtags = k.hashtags.filter((h) => h.tag.toLowerCase() !== String(r.params.tag));
        if (k.hashtags.length !== n) applied.add(r.text);
      }
    }
    for (const r of act) {
      if (r.kind === "prefer_tag" && k.hashtags.length < max && !k.hashtags.some((h) => h.tag.toLowerCase() === String(r.params.tag))) {
        k.hashtags.push({ tag: String(r.params.tag), purpose: "You often add this tag yourself.", evidence: "inferred" });
        applied.add(r.text);
      }
    }
  }
  if (out.photo) {
    out.photo.captions = out.photo.captions.map((c) => textRule("photoCaption", undefined, c));
    out.photo.headline = textRule("headline", undefined, out.photo.headline);
  }
  const list = [...applied];
  out.memoryApplied = list;
  return { plan: out, applied: list };
}

function shortenSentences(t: string, ratio: number) {
  if (!ratio || ratio >= 1) return t;
  const ss = sentences(t);
  if (ss.length <= 2) return t;
  const goal = t.length * ratio;
  const kept = [...ss];
  while (kept.join(" ").length > goal && kept.length > 2) kept.splice(kept.length - 2, 1); // drop from the middle, keep first and last (CTA)
  return kept.join(" ");
}

// ---------------------------------------------------------------- prompt block for AI agents

export function memoryForPrompt(rules: PreferenceRule[], events: DecisionEvent[]) {
  const act = activeRules(rules);
  const prefer = events.filter((e) => e.kind === "prefer" || e.kind === "approve").slice(-3).map((e) => e.after).filter(Boolean);
  const rejected = events.filter((e) => (e.kind === "reject" || e.kind === "regenerate") && e.before).slice(-3)
    .map((e) => ({ text: e.before, reasons: e.reasons }));
  return {
    rules: act.map((r) => `[${r.scope.field}${r.scope.platform !== "*" ? "/" + r.scope.platform : ""}] ${r.text} (${r.events} decisions)`),
    approvedExamples: prefer,
    rejectedDrafts: rejected,
  };
}

/** How much the user is still changing drafts: share of generated text they rewrite, recent vs earlier. */
export function learningMetric(events: DecisionEvent[]) {
  const edits = events.filter((e) => e.kind === "edit" && e.before && e.after);
  const change = (e: DecisionEvent) => {
    const a = new Set(words(e.before)), b = new Set(words(e.after));
    const union = new Set([...a, ...b]).size || 1;
    let same = 0; for (const w of a) if (b.has(w)) same++;
    return 1 - same / union;
  };
  if (edits.length < 6) return null;
  const half = Math.floor(edits.length / 2);
  const avg = (xs: DecisionEvent[]) => Math.round((xs.reduce((s, e) => s + change(e), 0) / xs.length) * 100);
  return { earlier: avg(edits.slice(0, half)), recent: avg(edits.slice(half)), edits: edits.length };
}
