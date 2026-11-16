/**
 * Template content engine — the "Fallback available" path used when no AI provider is connected
 * or an AI call fails. It writes complete, word-for-word copy, but only from what the user told us
 * (their description + brand profile) and what was technically measured. It never invents
 * reviews, prices, deadlines, customer reactions or product capabilities.
 */
import { estimateDuration, fitToDuration, spokenScript, DEFAULT_WPM } from "../duration";
import { RULES } from "../platforms";
import { postingWindows } from "../time";
import { hookAvoider, preferredCta } from "../memory";
import type {
  BrandProfile, PreferenceRule, ContentPlan, HashtagRec, MediaAsset, MediaUnderstanding, Objective, Platform,
  PlatformPackage, Project, ScriptSegment, SpeakingStyle, Tone,
} from "../types";
import { PLATFORMS } from "../types";
import { cap, fmtSec, pick, seeded, uid } from "../util";

export interface GenInput {
  brand: BrandProfile;
  project: Project;
  assets: MediaAsset[];
  understanding?: MediaUnderstanding;
  seed?: number;
  toneOverride?: Tone;
  now?: Date;
  /** The brand's learned preferences (feature 5). */
  memory?: PreferenceRule[];
  /** Active rules + examples, as sent to AI agents in a Brand Memory block. */
  memoryPrompt?: { rules: string[]; approvedExamples: string[]; rejectedDrafts: { text: string; reasons: string[] }[] };
}

// ---------- phrase banks ----------
const OPENERS: Record<Tone, string[]> = {
  confident: ["Here's what we just made.", "This is exactly why people order custom.", "Let me show you what we've been working on."],
  luxury: ["Some gifts deserve to be one of one.", "Made for someone who has everything.", "Quietly, this might be my favorite piece yet."],
  casual: ["Okay, I'm obsessed with how this came out.", "Not me making another one of these…", "So this happened in the studio today."],
  funny: ["My printer and I have been very busy.", "Plot twist: it came out even better than the mockup.", "POV: you said 'make it custom' and meant it."],
  educational: ["Here's how a custom piece actually gets made.", "Ever wondered how this is printed?", "Three things to know before ordering a custom piece."],
  inspirational: ["Every custom order starts with somebody's idea.", "This started as a photo on a phone.", "Small business, big ideas — here's today's."],
  bold: ["Stop scrolling — look at this detail.", "This is what full custom looks like.", "Watch this come to life."],
  trend: ["Tell me you're a small business without telling me…", "Things that just make sense: custom everything.", "This is your sign to go custom."],
  custom: ["Here's what we just made.", "Let me show you this one.", "This one's special."],
};
const CLOSERS: Record<Tone, string[]> = {
  confident: ["Made to order, start to finish.", "Every piece is made to order."],
  luxury: ["Made to order, with care in every detail.", "Thoughtful, personal, and made to last."],
  casual: ["Honestly, so happy with this one.", "I could make these all day."],
  funny: ["My printer deserves a raise.", "Yes, I'm proud. Yes, I'll make you one."],
  educational: ["That's the whole process, start to finish.", "Now you know what goes into a custom order."],
  inspirational: ["Your idea could be next.", "This is why I love what I do."],
  bold: ["That's custom. That's the difference.", "Nothing off the shelf about it."],
  trend: ["Custom just hits different.", "You know you want one."],
  custom: ["Made to order.", "Made just for you."],
};

const OBJECTIVE_CTA: Record<Objective, string[]> = {
  custom_orders: ["Request a Custom Quote", "Order at", "DM for Details"],
  bulk_buyers: ["Ask About Bulk Pricing", "Request a Custom Quote"],
  website: ["Order at", "Shop Personalized Gifts"],
  leads: ["DM for Details", "Request a Custom Quote"],
  bookings: ["DM for Details"],
  new_product: ["Shop Personalized Gifts", "Order at"],
  followers: ["Follow for Part 2"],
  engagement: ["Save This Idea", "Share With Someone Who Needs It"],
  views: ["Share With Someone Who Needs It", "Follow for Part 2"],
  awareness: ["Follow for Part 2", "Save This Idea"],
};

export function domainOf(url: string) {
  return url.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
}

export function chooseCta(brand: BrandProfile, objective: Objective, rnd: () => number = () => 0): string {
  const wanted = OBJECTIVE_CTA[objective];
  const matches = brand.ctas.filter((c) => wanted.some((w) => c.toLowerCase().startsWith(w.toLowerCase())));
  const c = matches.length ? pick(matches, rnd) : brand.ctas[0] || "DM for details";
  return c;
}

function ctaSpoken(cta: string, brand: BrandProfile, platform?: Platform): string {
  const site = brand.website ? domainOf(brand.website) : "";
  const l = cta.toLowerCase();
  if (l.startsWith("order at")) return site ? `Order yours at ${site}.` : "Order yours — link in bio.";
  if (l.includes("quote")) return platform === "facebook" && site ? `Request a custom quote at ${site}.` : "Send me a message for a custom quote.";
  if (l.includes("bulk")) return "Need a bunch for your business or event? Ask me about bulk pricing.";
  if (l.startsWith("dm")) return "DM me for details.";
  if (l.includes("shop")) return site ? `Shop personalized gifts at ${site}.` : "Shop personalized gifts — link in bio.";
  if (l.includes("follow")) return `Follow ${brand.name} for part two.`;
  if (l.includes("save")) return "Save this for your next gift idea.";
  if (l.includes("share")) return "Send this to someone who needs one.";
  return cta.endsWith(".") ? cta : cta + ".";
}

function city(brand: BrandProfile) {
  return brand.location.split(",")[0]?.trim() || "";
}

function subjectOf(inp: GenInput): { subject: string; known: boolean } {
  const idea = inp.project.idea.trim().replace(/[.!]+$/, "");
  if (idea) return { subject: idea, known: true };
  const o = inp.understanding?.observed;
  if (o?.products?.length) return { subject: o.products[0], known: true };
  if (o?.subjects?.length) return { subject: o.subjects[0], known: true };
  return { subject: "this custom piece", known: false };
}

function lc(s: string) { return s ? s[0].toLowerCase() + s.slice(1) : s; }

/** "custom photo keychain with a name, for bridal party gifts" → "custom photo keychain" */
export function coreSubject(s: string) {
  const cut = s.split(/,|\s+(?:for|with|that|which|to|from|in|on|made|featuring)\s+|\s+[-–—]\s+/i)[0].trim();
  const words = cut.split(/\s+/);
  return words.length > 6 ? words.slice(0, 6).join(" ") : cut || s;
}

/** "unboxing my new printer", "how I make…", "my first UV print" describe an activity, not a product. */
export function isActivity(s: string) {
  const first = s.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  return /ing$/.test(first) && !/^(string|ring|bling|wedding|ceiling|clothing|sterling|earring|keyring|sling|swing|king)$/.test(first)
    || /^(how|my|our|behind|day|a day|first|setting|packing|answering|testing|showing|making|printing)$/.test(first)
    || /^(how|why|what) /i.test(s.trim());
}

/** Product-vs-activity aware phrasing used across captions, headlines and hooks. */
export function phrasing(subject: string, city: string) {
  const core = lc(coreSubject(subject));
  const activity = isActivity(subject);
  const known = subject !== "this custom piece";
  const customCore = /^(custom|personalized)/.test(core) ? core : "custom " + core;
  return activity ? {
    core, activity,
    intro: "Here's how it went, start to finish.",
    name: cap(core),
    headline: cap(core),
    tagline: `${cap(core)}${city ? ` — in ${city}` : ""}`,
    short: `${cap(core)} ✨`,
    benefitHook: `${cap(core)} — stay for the end.`,
    storyHook: `Come along for this one: ${core}.`,
    benefitAlts: [`${cap(core)}, start to finish.`, `Watch this: ${core}.`],
    storyAlts: ["Here's how it went.", "Let me show you how this went."],
    direct: `${cap(core)} — see how it went`,
    cover: cap(core),
    lookingFor: `Want something custom made for you? Here's what we're working with.`,
    title: `${cap(core)} — behind the scenes`,
    part2: `Part 2: ${core} — the results`,
    making: core,
  } : {
    core, activity,
    intro: `This is ${withArticle(lc(subject))}${city ? `, made here in ${city}` : ""}.`,
    name: cap(core),
    headline: `${cap(core)}, made to order`,
    tagline: `${cap(core)}${city ? `, made in ${city}` : ""}`,
    short: `${cap(core)} — made to order ✨`,
    benefitHook: known ? `If you need ${withArticle(customCore)}, watch this.` : "If you need something custom made, watch this.",
    storyHook: "Here's how this one came together.",
    benefitAlts: [`${cap(customCore)}, made for you. Here's a closer look.`, `Want ${withArticle(customCore)}? Here's what that looks like.`],
    storyAlts: ["From idea to finished piece, start to finish.", "Let me walk you through this one."],
    direct: `${cap(customCore)} — order yours`,
    cover: `${cap(core)}, made to order`,
    lookingFor: `Looking for ${withArticle(customCore)}? This is what we make.`,
    title: `${cap(core)} — made-to-order reveal`,
    part2: `Part 2: how ${withArticle(core)} gets personalized`,
    making: withArticle(core),
  };
}

/** Adds "a"/"an" where English needs it: "custom keychain" → "a custom keychain". */
export function withArticle(s: string) {
  const first = s.split(/\s+/)[0]?.toLowerCase() ?? "";
  const head = coreSubject(s).split(/\s+/).pop()?.toLowerCase() ?? "";
  if (/^(a|an|the|my|our|this|these|those|some|\d+)$/.test(first) || /^(this custom piece)$/.test(s)) return s;
  if (/s$/.test(head) && !/ss$/.test(head)) return s; // plural
  return (/^[aeiou]/i.test(s) ? "an " : "a ") + s;
}

function audiencePhrase(brand: BrandProfile, objective: Objective) {
  if (objective === "bulk_buyers") return "businesses and events that need them in bulk";
  if (/wedding|event|favor/i.test(brand.targetAudience) && objective === "custom_orders") return "gifts, events, and small businesses";
  return "gifts, events, and small businesses";
}

// ---------- hashtags & keywords ----------
function slugTag(s: string) {
  return "#" + s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "");
}

export function keywordPhrases(inp: GenInput): string[] {
  const { subject } = subjectOf(inp);
  const b = inp.brand;
  const words = new Set(subject.toLowerCase().split(/\W+/).filter((w) => w.length > 3).map((w) => w.replace(/s$/, "")));
  const related = b.products.filter((p) => p.toLowerCase().split(/\W+/).some((w) => words.has(w.replace(/s$/, ""))));
  const out = new Set<string>();
  if (subject !== "this custom piece") out.add(lc(coreSubject(subject)));
  for (const r of related.slice(0, 3)) out.add(r.toLowerCase());
  const c = city(b);
  if (c && related[0]) out.add(`${related[0].toLowerCase()} ${c}`);
  if (c) out.add(`custom gifts ${c}`);
  if (inp.project.objective === "bulk_buyers") out.add("bulk custom orders");
  return [...out].slice(0, 6);
}

function hashtagsFor(platform: Platform, inp: GenInput, rnd: () => number): HashtagRec[] {
  const b = inp.brand;
  const kws = keywordPhrases(inp);
  const recs: HashtagRec[] = [];
  const push = (tag: string, purpose: string) => {
    if (tag.length < 3 || recs.some((r) => r.tag === tag)) return;
    recs.push({ tag, purpose, evidence: "inferred" });
  };
  const brandTag = slugTag(b.handles[platform]?.replace("@", "") || b.name);
  const main = kws[0] ? slugTag(kws[0].split(" ").slice(-3).join(" ")) : "";
  const second = kws[1] ? slugTag(kws[1]) : "";
  const c = city(b);
  if (platform === "tiktok") {
    if (main) push(main, "Describes exactly what's in the video so TikTok search can match it.");
    if (second) push(second, "Related product phrase buyers search for.");
    push("#smallbusiness", "Broad community tag for small-business content.");
    if (c) push(slugTag(c + " small business"), "Local discovery for nearby customers.");
    push(brandTag, "Your brand tag, so people can find all your work.");
  } else if (platform === "instagram") {
    if (main) push(main, "Niche tag matching the product shown.");
    push("#personalizedgifts", "Gift shoppers browse this niche.");
    if (c) push(slugTag(c), "Local tag for customers near you.");
    if (second && rnd() > 0.3) push(second, "Second product phrase for search.");
    push(brandTag, "Your brand tag.");
  } else {
    push(brandTag, "Your brand tag.");
    if (main) push(main, "One descriptive tag for the product.");
    if (c) push(slugTag(c), "Local relevance.");
  }
  return recs.slice(0, RULES[platform].hashtagMax);
}

// ---------- durations ----------
function targetFor(inp: GenInput, style: SpeakingStyle): { sec: number; why: string } {
  const p = inp.project;
  const videos = inp.assets.filter((a) => a.kind === "video");
  const footage = videos.reduce((s, a) => s + (a.tech?.durationSec ?? 0), 0);
  const images = inp.assets.filter((a) => a.kind === "image").length;
  if (p.singlePictureMode === "short_video") return { sec: 10, why: "One photo holds attention for about 10 seconds with motion and text — long enough for a reveal and a CTA, short enough to rewatch." };
  if (p.singlePictureMode === "voiceover") return { sec: 15, why: "A single photo with a voiceover works best around 15 seconds: hook, one detail, CTA." };
  if (p.singlePictureMode === "talking") return { sec: 25, why: "Talking to camera about one product: about 25 seconds covers what it is, who it's for, and how to order." };
  if (p.singlePictureMode === "story") return { sec: 7, why: "A single Story frame shows for a few seconds; keep it to one idea." };
  if (videos.length) {
    const base = style === "talking" ? 30 : style === "music_only" || style === "text_only" ? 15 : 25;
    const sec = Math.max(12, Math.min(base, Math.round(footage * 0.85) || base));
    return { sec, why: `You uploaded ${fmtSec(footage)} of footage. A ${sec}s cut keeps the strongest moments and drops setup.` };
  }
  if (images > 1) return { sec: Math.min(20, 4 + images * 2.5), why: `${images} photos at about 2–3 seconds each plus an opening and a CTA.` };
  return { sec: 15, why: "A short, single-idea video around 15 seconds." };
}

// ---------- the script ----------
function buildSegments(inp: GenInput, style: SpeakingStyle, hook: string, cta: string, rnd: () => number): ScriptSegment[] {
  const b = inp.brand;
  const tone = inp.toneOverride ?? inp.project.tone;
  const { subject } = subjectOf(inp);
  const ph = phrasing(subject, city(b));
  const videos = inp.assets.filter((a) => a.kind === "video");
  const silent = style === "text_only" || style === "music_only";
  const sharpest = bestFrame(inp.assets);
  const seg = (label: string, spoken: string, onScreen: string, visual: string, direction: string, demoSec = 0, sourceRef?: ScriptSegment["sourceRef"]): ScriptSegment =>
    ({ id: uid(), label, spoken: silent ? "" : spoken, onScreen, visual, direction, demoSec, sourceRef });

  const segs: ScriptSegment[] = [];
  segs.push(seg("Hook", hook, shortOnScreen(hook), sharpest
    ? `Open on the finished piece — the clearest sample is ${sharpest.label}.`
    : "Open on the finished piece, filling the frame.", "No intro, no logo first. Start talking on frame one.", 0, sharpest?.ref));
  segs.push(seg(ph.activity ? "What's happening" : "What it is", ph.intro, ph.name, "Slow push-in or a hand turning the piece so details catch the light.", "Short pause after the line so viewers can look.", videos.length ? 1.5 : 1));
  if (videos.length) {
    segs.push(seg("How it's made", "Here's a quick look at how it comes together.", "How it's made", "Fast cuts of the process — printing, finishing, assembling. Two to three shots, under a second each.", "Speed up long process shots (2–4x). Cut on motion.", 3));
  }
  segs.push(seg(ph.activity ? "Why it matters" : "Why it's special", ph.activity ? `It means more custom pieces for ${audiencePhrase(b, inp.project.objective)}.` : `${pick(CLOSERS[tone], rnd)} Perfect for ${audiencePhrase(b, inp.project.objective)}.`, "Made to order", "Show it in use or held up next to something for scale.", "Let one beat of music land before the CTA.", 1));
  segs.push(seg("Call to action", ctaSpoken(cta, b), cta, "End on the product with your handle on screen.", "Hold the last frame 1–2 seconds so the CTA can be read.", 1));
  return segs;
}

function shortOnScreen(s: string) {
  const w = s.replace(/[.!?…]+$/, "").split(/\s+/);
  return w.length <= 7 ? w.join(" ") : w.slice(0, 7).join(" ") + "…";
}

/** Sharpest real sample frame — grounded in measured data, with its true timestamp. */
export function bestFrame(assets: MediaAsset[]) {
  let best: { label: string; ref: { assetId: string; t?: number }; score: number } | undefined;
  assets.forEach((a, i) => {
    if (a.kind === "video") {
      for (const f of a.tech?.frames ?? []) {
        const score = f.sharpness + Math.min(f.brightness, 60) * 0.3;
        if (!best || score > best.score) best = { label: `clip ${i + 1} at ${fmtSec(f.t)}`, ref: { assetId: a.id, t: f.t }, score };
      }
    } else if (a.tech) {
      const score = a.tech.sharpness + Math.min(a.tech.brightness, 60) * 0.3;
      if (!best || score > best.score) best = { label: `photo ${i + 1}`, ref: { assetId: a.id }, score };
    }
  });
  return best;
}

function editPlan(inp: GenInput, target: number) {
  const plan: string[] = [];
  const missing: string[] = [];
  const videos = inp.assets.filter((a) => a.kind === "video");
  const images = inp.assets.filter((a) => a.kind === "image");
  const footage = videos.reduce((s, a) => s + (a.tech?.durationSec ?? 0), 0);
  videos.forEach((v) => {
    const i = inp.assets.indexOf(v) + 1;
    const t = v.tech;
    if (!t) return;
    if (t.orientation !== "vertical") plan.push(`Clip ${i} is ${t.orientation} (${t.aspect}) — crop to 9:16 and keep the product centered.`);
    const soft = (t.frames ?? []).filter((f) => f.sharpness < 22);
    if (soft.length) plan.push(`Clip ${i} looks soft around ${soft.slice(0, 3).map((f) => fmtSec(f.t)).join(", ")} — trim those moments or swap in a sharper take.`);
    const dark = (t.frames ?? []).filter((f) => f.brightness < 22);
    if (dark.length) plan.push(`Clip ${i} is dark around ${dark.slice(0, 3).map((f) => fmtSec(f.t)).join(", ")} — brighten or cut.`);
  });
  if (footage > target) plan.push(`You have ${fmtSec(footage)} of footage for a ${fmtSec(target)} cut — keep about ${Math.round((target / footage) * 100)}% and lose setup and repeated angles.`);
  if (videos.length && footage < target * 0.6) missing.push(`Footage is short (${fmtSec(footage)}). A close-up of the finished piece (3–5s) would fill the gap.`);
  if (images.length && !videos.length && inp.project.singlePictureMode !== "photo") plan.push("This is an estimated storyboard for animating your photo — nothing has been rendered yet.");
  if (!plan.length) plan.push("Footage looks usable as-is. Order: finished piece → detail → process → finished piece with CTA.");
  plan.push("Timing here is an estimated storyboard. Exact cut points come from the editor in Phase 3.");
  return { plan, missing };
}

// ---------- package per platform ----------
function packageFor(platform: Platform, inp: GenInput, base: { hooks: string[]; segments: ScriptSegment[]; target: number; cta: string }, rnd: () => number): PlatformPackage {
  const b = inp.brand;
  const r = RULES[platform];
  const { subject } = subjectOf(inp);
  const c = city(b);
  const ph = phrasing(subject, c);
  const isPhoto = inp.project.singlePictureMode === "photo";
  const isVideo = !isPhoto && inp.project.singlePictureMode !== "story" && inp.project.singlePictureMode !== "carousel";
  const site = b.website ? domainOf(b.website) : "";
  const kws = keywordPhrases(inp);
  const hashtags = hashtagsFor(platform, inp, rnd);
  const ctaLine = ctaSpoken(base.cta, b, platform);

  const hookIdx = platform === "tiktok" ? 0 : platform === "instagram" ? 1 : 2;
  const hook = base.hooks[hookIdx % base.hooks.length];

  let postType: string, caption: string, shortCaption: string, angle: string, explanation: string, cta: string;
  const onScreen = base.segments.map((s) => s.onScreen).filter(Boolean);
  if (platform === "tiktok") {
    postType = isPhoto ? "Photo post (TikTok photo mode)" : inp.project.singlePictureMode === "carousel" ? "Photo carousel" : "Video";
    angle = "Personal, behind-the-scenes, fast hook";
    caption = `${hook} ${ph.tagline}. ${ctaLine}`;
    shortCaption = ph.short;
    cta = base.cta;
    explanation = "TikTok rewards a strong first second and searchable plain-language captions, so the caption repeats what the video shows in words people search.";
  } else if (platform === "instagram") {
    postType = isPhoto ? "Feed photo" : inp.project.singlePictureMode === "carousel" ? "Carousel" : inp.project.singlePictureMode === "story" ? "Story" : "Reel";
    angle = "Polished product showcase, save-worthy";
    caption = `${ph.headline}.\n\n${pick(CLOSERS[inp.project.tone], rnd)} Ideal for ${audiencePhrase(b, inp.project.objective)}.\n\n${ctaLine.replace(/at [^ ]+\.$/, "— link in bio.")}`;
    shortCaption = ph.activity ? `${ph.name} ✦` : `${ph.name} ✦ made to order`;
    cta = base.cta.toLowerCase().startsWith("order at") ? "Link in bio" : base.cta;
    explanation = "Instagram shows only the first line before 'more', so it reads as a headline. Links aren't clickable in captions, so the CTA points to bio or DMs.";
  } else {
    postType = isPhoto ? "Page photo post" : inp.project.singlePictureMode === "story" ? "Story" : "Reel";
    angle = "Warm, community-focused, clear next step";
    caption = `${hook}\n\n${ph.intro} Every piece is made to order for ${audiencePhrase(b, inp.project.objective)}.\n\n${ctaLine}${site && !ctaLine.includes(site) ? `\n${b.website}` : ""}`;
    shortCaption = `${ph.headline}${site ? ` — ${site}` : ""}`;
    cta = base.cta;
    explanation = "Facebook audiences read a bit more and links are clickable in Page posts, so the caption explains who it's for and links straight to ordering.";
  }

  const segs = platform === "tiktok" ? base.segments : base.segments.map((s, i) => (i === 0 ? { ...s, spoken: s.spoken ? hook : "" } : s));
  const script = isVideo ? spokenScript(segs) : "";
  const est = estimateDuration(segs, inp.project.speakingRateWpm || DEFAULT_WPM);
  const contentUse = b.contentUse;
  const audio = !b.formatPrefs.music
    ? { suggestion: "No music — original sound or voice only (your preference).", evidence: "general" as const, rightsNote: "" }
    : {
      suggestion: platform === "tiktok"
        ? `An upbeat ${b.musicStyles.split(",")[0]?.trim().toLowerCase() || "instrumental"} track from TikTok's Commercial Music Library, low under your voice.`
        : platform === "instagram"
          ? `A ${b.musicStyles.split(",")[2]?.trim().toLowerCase() || "clean, upbeat"} instrumental from Instagram's audio library, kept under the voiceover.`
          : "A light instrumental from Meta Sound Collection, or your original sound.",
      evidence: "general" as const,
      rightsNote: contentUse === "personal"
        ? "Check availability and usage rights in the platform before posting."
        : "Business, sponsored or ad content: use the platform's commercial-cleared library. Check availability and usage rights in the platform before posting.",
    };
  return {
    platform,
    postType,
    angle,
    hook,
    script,
    durationSec: isVideo ? Math.round(Math.max(est.totalSec, Math.min(base.target, r.video.shortFormMaxSec))) : undefined,
    onScreenText: isVideo ? onScreen : [shortOnScreen(hook), ph.name],
    caption: caption.slice(0, r.captionMax - 200),
    shortCaption,
    coverHeadline: platform === "tiktok" ? shortOnScreen(hook) : platform === "instagram" ? ph.cover : ph.direct,
    hashtags,
    searchPhrases: kws,
    audio,
    postingWindows: postingWindows(platform, {
      creatorTz: b.creatorTimezone,
      audienceTzs: b.audienceTimezones,
      objective: inp.project.objective,
    }, inp.now),
    cta,
    explanation,
    workflow: [
      `Export or film the ${postType.toLowerCase()} in 9:16 (${r.video.width}×${r.video.height}).`,
      "Copy the caption and hashtags from this tab.",
      audio.suggestion.startsWith("No music") ? "Post with original sound." : "Add the sound inside the app (licensed audio can't be attached from here).",
      "Review on-screen text placement against the app's buttons before posting.",
      "Post, or set a reminder for the recommended window.",
    ],
  };
}

// ---------- public API ----------
export function generateTemplatePlan(inp: GenInput): ContentPlan {
  const seed = inp.seed ?? Date.now();
  const rnd = seeded(seed);
  const b = inp.brand;
  const p = inp.project;
  const tone = inp.toneOverride ?? p.tone;
  const { subject } = subjectOf(inp);
  const subj = lc(subject);
  const ph = phrasing(subject, city(b));
  const core = ph.core;
  const style: SpeakingStyle = p.speakingStyle;
  const cta = preferredCta(inp.memory ?? [], b.ctas) ?? chooseCta(b, p.objective, rnd);

  // Hooks: skip anything the user rejected before (feature 5), falling back through alternates.
  const avoid = hookAvoider(inp.memory ?? []);
  const firstOk = (list: string[]) => list.find((t) => !avoid.isAvoided(t)) ?? list[0];
  const opener = OPENERS[tone] ?? OPENERS.confident;
  const shuffled = [...opener].sort(() => rnd() - 0.5);
  const otherTones = (Object.keys(OPENERS) as Tone[]).filter((t) => t !== tone && t !== "custom").flatMap((t) => OPENERS[t]);
  const hooks = [
    { text: firstOk([...shuffled, ...otherTones]), style: "Curiosity" },
    { text: firstOk([ph.benefitHook, ...ph.benefitAlts]), style: "Direct benefit" },
    { text: firstOk(p.objective === "bulk_buyers" ? [`Here's how we make ${core} for businesses — in bulk.`, ph.storyHook, ...ph.storyAlts] : [ph.storyHook, ...ph.storyAlts]), style: "Story" },
  ];
  let recIdx = p.objective === "custom_orders" || p.objective === "bulk_buyers" || p.objective === "leads" ? 1 : 0;
  if (avoid.avoidsStyle(hooks[recIdx].style)) recIdx = hooks.findIndex((h) => !avoid.avoidsStyle(h.style)) >= 0 ? hooks.findIndex((h) => !avoid.avoidsStyle(h.style)) : recIdx;
  const { sec: target, why } = targetFor(inp, style);
  let segments = buildSegments(inp, style, hooks[recIdx].text, cta, rnd);
  segments = fitToDuration(segments, target, p.speakingRateWpm || DEFAULT_WPM);
  const { plan: edits, missing } = editPlan(inp, target);

  const packages = Object.fromEntries(
    PLATFORMS.map((pl) => [pl, packageFor(pl, inp, { hooks: hooks.map((h) => h.text), segments, target, cta }, rnd)]),
  ) as Record<Platform, PlatformPackage>;

  const shortSegs = fitToDuration(segments, Math.max(6, Math.round(target * 0.55)), p.speakingRateWpm || DEFAULT_WPM);
  const isSingle = inp.assets.length === 1 && inp.assets[0].kind === "image";
  const best = bestFrame(inp.assets);
  const altFromAI = inp.understanding?.source === "ai" ? inp.understanding.observed.summary : "";

  return {
    generatedBy: "template",
    generatedAt: new Date().toISOString(),
    concept: {
      title: p.objective === "bulk_buyers" && !ph.activity ? `${ph.name} — bulk showcase` : ph.title,
      angle: "Show the finished piece first, then how it's made, then how to order.",
      why: "Leading with the finished product shows the benefit in the first second; the CTA matches your goal.",
    },
    hooks,
    recommendedHook: {
      index: recIdx,
      reason: recIdx === 1
        ? "Your goal is orders, so the hook names the product and who it's for — it filters for buyers rather than casual viewers."
        : "Curiosity hooks hold attention for reach-focused goals.",
    },
    speakingStyle: style,
    targetDurationSec: target,
    durationReason: why,
    segments,
    shortScript: spokenScript(shortSegs) || shortSegs.map((s) => s.onScreen).join(" / "),
    altAngle: `Alternate angle: film your hands making ${ph.making} start to finish as a timelapse, with only on-screen text and music. Good for reach; weaker for orders.`,
    editPlan: edits,
    missingFootage: missing,
    photo: isSingle ? {
      captions: [
        `${ph.tagline}. ${ctaSpoken(cta, b)}`,
        `${pick(CLOSERS[tone], rnd)} ${ph.name} — ${ctaSpoken(cta, b).toLowerCase()}`,
        `${ph.lookingFor} ${ctaSpoken(cta, b)}`,
      ],
      headline: ph.headline,
      overlay: shortOnScreen(hooks[recIdx].text),
      audience: b.targetAudience || "People looking for personalized gifts and custom products",
      altText: altFromAI
        ? altFromAI
        : `Photo of ${withArticle(subj)}. (Please review: add colors, text on the piece, and setting so people using screen readers get the full picture.)`,
      storyLayout: [
        "Photo fills the frame, product centered in the middle third.",
        `Top text (safe zone, below the profile bar): "${shortOnScreen(hooks[0].text)}"`,
        "Interactive: a poll sticker — \"Would you gift this? Yes / Obviously\" — or a question sticker \"What would you put on yours?\"",
        `Bottom: link sticker to ${b.website ? domainOf(b.website) : "your shop"} with "${cta}".`,
      ],
      carouselSlides: [
        { title: "Slide 1 — the photo", body: hooks[recIdx].text, needs: "Your uploaded photo" },
        { title: "Slide 2 — what it is", body: ph.activity ? `${ph.name}.` : `${ph.name}. Made to order.`, needs: "Text slide (can be made from brand colors)" },
        { title: "Slide 3 — personalize it", body: "Names, photos, logos, colors — tell us what you want.", needs: "Text slide, or a second photo of a different version (yours)" },
        { title: "Slide 4 — how to order", body: ctaSpoken(cta, b), needs: "Text slide" },
      ],
      motionPlan: [
        { effect: "Slow zoom in on the product", seconds: 3 },
        { effect: `Animated text: "${shortOnScreen(hooks[recIdx].text)}"`, seconds: 3 },
        { effect: "Gentle pan across details", seconds: 2 },
        { effect: `Animated CTA: "${cta}"`, seconds: 2 },
      ],
    } : undefined,
    packages,
    cover: {
      assetId: best?.ref.assetId,
      frameT: best?.ref.t,
      reason: best ? `Suggested ${best.label}: it's the sharpest, best-lit sample from your own media.` : "Use your clearest shot of the finished product.",
      headlines: {
        curiosity: ph.activity ? "You have to see how this turned out" : "Wait for the final piece",
        premium: ph.cover,
        direct: ph.direct,
      },
    },
    ideas: [
      ph.part2,
      ph.activity ? "Packing a customer order" : `Packing ${ph.making} for a customer order`,
      "Answering the most common question you get about custom orders",
    ],
  };
}
