"use client";
import { estimateDuration, fitToDuration, DEFAULT_WPM, wordCount } from "../duration";
import type { ContentPlan, MediaAsset, MediaUnderstanding, SectionKey, Tone, UsageRecord } from "../types";
import { deepClone, nowISO, uid } from "../util";
import { AIUnavailable, analyzeWithAI, generateWithAI } from "./ai";
import { mergeRespectingLocks, replaceOneSection } from "./sections";
import { generateTemplatePlan, type GenInput } from "./template";

export type RewriteKind = "shorter" | "longer" | "exciting" | "professional" | "luxurious" | "sales" | "another";
export const REWRITES: { id: RewriteKind; label: string }[] = [
  { id: "shorter", label: "Make shorter" },
  { id: "longer", label: "Make longer" },
  { id: "exciting", label: "More exciting" },
  { id: "professional", label: "More professional" },
  { id: "luxurious", label: "More luxurious" },
  { id: "sales", label: "More sales-focused" },
  { id: "another", label: "Another version" },
];
const INSTRUCTION: Record<RewriteKind, string> = {
  shorter: "Make the script about 30% shorter. Keep the hook and CTA; cut the weakest middle lines.",
  longer: "Make the script about 35% longer by adding one useful, true detail viewers would want. Do not invent facts.",
  exciting: "Rewrite with more energy and momentum — punchier sentences, stronger verbs. No hype claims.",
  professional: "Rewrite in a polished, professional business-owner voice.",
  luxurious: "Rewrite in a refined, premium, understated luxury voice.",
  sales: "Rewrite to be more sales-focused: make it clear who should order and exactly how, without inventing prices, deadlines or offers.",
  another: "Write a genuinely different version with a different structure and hook.",
};
const TONE_FOR: Partial<Record<RewriteKind, Tone>> = { exciting: "bold", professional: "confident", luxurious: "luxury" };

export interface Deps {
  getPreview: (a: MediaAsset) => Promise<string | undefined>;
  getBlob: (a: MediaAsset) => Promise<Blob | undefined>;
  logUsage: (r: UsageRecord) => Promise<void>;
  aiEnabled: boolean;
}

function technicalOnly(input: GenInput): MediaUnderstanding {
  const notes = input.assets.flatMap((a, i) => (a.tech?.notes ?? []).map((n) => `${a.kind === "video" ? "Clip" : "Photo"} ${i + 1}: ${n}`));
  return {
    source: "technical-only",
    observed: {
      summary: input.project.idea ? `You described this as: ${input.project.idea}` : "",
      subjects: [], products: [], setting: "", onScreenText: [], transcript: "", activities: [],
      moments: input.assets.flatMap((a) => a.kind === "video"
        ? (a.tech?.frames ?? []).filter((f) => f.sharpness >= 45).slice(0, 4).map((f) => ({ assetId: a.id, t: f.t, description: `Sharp frame (focus ${f.sharpness}/100)`, usable: true }))
        : []),
      qualityNotes: notes,
    },
    suggested: { hooks: [], audiences: [], usableSceneOrder: [] },
    clarifyingQuestion: input.project.idea.trim() ? undefined : "What is this, in a few words? (e.g. \"custom photo keychain for a bridal party\")",
    createdAt: nowISO(),
  };
}

export async function analyze(input: GenInput, deps: Deps): Promise<{ understanding: MediaUnderstanding; notice?: string }> {
  if (!deps.aiEnabled) return { understanding: technicalOnly(input), notice: "AI isn't connected, so only technical checks ran (focus, light, framing, length). Content is written from your description." };
  try {
    const u = await analyzeWithAI(input, deps.getPreview, deps.getBlob);
    await deps.logUsage({ id: uid(), at: nowISO(), kind: "analyze", provider: u.provider ?? "ai", ok: true, note: `${input.assets.length} file(s)` });
    // keep the measured quality notes alongside the AI's
    const t = technicalOnly(input);
    u.observed.qualityNotes = [...t.observed.qualityNotes, ...u.observed.qualityNotes];
    return { understanding: u };
  } catch (e) {
    await deps.logUsage({ id: uid(), at: nowISO(), kind: "analyze", provider: "ai", ok: false, note: (e as Error).message });
    return { understanding: technicalOnly(input), notice: aiFailNotice(e) };
  }
}

function aiFailNotice(e: unknown) {
  const code = e instanceof AIUnavailable ? e.code : "";
  if (code === "limit_reached") return "Your monthly AI limit is reached, so this used the template writer. Raise the limit in Settings to use AI again.";
  if (code === "not_configured") return "AI isn't set up on the server yet, so this used the template writer.";
  return `AI didn't respond (${(e as Error).message}). Your work is safe — this used the template writer instead. Try again later.`;
}

export interface GenOptions {
  current?: ContentPlan;
  locked?: Partial<Record<SectionKey, "edited" | "approved">>;
  section?: SectionKey;
  rewrite?: RewriteKind;
  tone?: Tone;
}

export async function generate(input: GenInput, deps: Deps, opts: GenOptions = {}): Promise<{ plan: ContentPlan; notice?: string; usedAI: boolean }> {
  const wpm = input.project.speakingRateWpm || DEFAULT_WPM;
  const toneOverride = opts.tone ?? (opts.rewrite ? TONE_FOR[opts.rewrite] : undefined);
  const seed = Math.floor(Math.random() * 1e9);
  const base = generateTemplatePlan({ ...input, seed, toneOverride });
  let fresh = base;
  let usedAI = false;
  let notice: string | undefined;

  if (deps.aiEnabled) {
    try {
      const instruction = opts.rewrite ? INSTRUCTION[opts.rewrite] : opts.tone ? `Rewrite in this tone: ${opts.tone}.` : undefined;
      fresh = await generateWithAI({ ...input, toneOverride }, base, { section: opts.section, instruction, current: opts.current });
      usedAI = true;
      await deps.logUsage({ id: uid(), at: nowISO(), kind: opts.rewrite ? "rewrite" : "generate", provider: fresh.provider ?? "ai", ok: true, note: opts.section ?? "full plan" });
    } catch (e) {
      await deps.logUsage({ id: uid(), at: nowISO(), kind: "generate", provider: "ai", ok: false, note: (e as Error).message });
      notice = aiFailNotice(e);
    }
  }

  // Template-path rewrites act on the current script directly.
  if (!usedAI && opts.current && opts.rewrite) {
    const cur = deepClone(opts.current);
    if (opts.rewrite === "shorter") {
      cur.targetDurationSec = Math.max(5, Math.round(cur.targetDurationSec * 0.7));
      cur.segments = fitToDuration(cur.segments, cur.targetDurationSec, wpm);
      fresh = { ...fresh, segments: cur.segments, targetDurationSec: cur.targetDurationSec };
    } else if (opts.rewrite === "longer") {
      const extra = { id: uid(), label: "Make it yours", spoken: "Tell me what you want on yours — a name, a photo, a logo — and I'll make it to order.", onScreen: "Make it yours", visual: "Show two or three different versions side by side, if you have them.", direction: "Quick cuts between versions.", demoSec: 1.5 };
      cur.segments.splice(Math.max(1, cur.segments.length - 1), 0, extra);
      cur.targetDurationSec = Math.round(Math.max(cur.targetDurationSec * 1.35, estimateDuration(cur.segments, wpm).totalSec));
      fresh = { ...fresh, segments: cur.segments, targetDurationSec: cur.targetDurationSec };
    } else if (opts.rewrite === "sales") {
      const mid = cur.segments[cur.segments.length - 2];
      if (mid && !/quote|order/i.test(mid.spoken)) mid.spoken = `${mid.spoken} If you need one for a gift, an event, or your business, I can make it.`.trim();
      fresh = { ...fresh, segments: cur.segments };
    }
  }

  // Auto-revise: a script that doesn't fit its target gets shortened.
  const est = estimateDuration(fresh.segments, wpm).totalSec;
  if (input.project.singlePictureMode !== "photo" && est > fresh.targetDurationSec * 1.15 && !opts.locked?.script) {
    fresh.segments = fitToDuration(fresh.segments, fresh.targetDurationSec, wpm);
    notice = [notice, `Script ran ~${Math.round(est)}s for a ${fresh.targetDurationSec}s target, so it was shortened automatically.`].filter(Boolean).join(" ");
  }
  // Keep each platform's script in step with the edited main script when the script was rewritten.
  if (opts.section === "script" || opts.rewrite) {
    const spoken = fresh.segments.map((s) => s.spoken.trim()).filter(Boolean).join(" ");
    for (const p of Object.keys(fresh.packages) as (keyof ContentPlan["packages"])[]) if (fresh.packages[p].script) fresh.packages[p].script = spoken;
  }

  let plan: ContentPlan;
  if (opts.current && (opts.section || opts.rewrite)) {
    const key: SectionKey = opts.section ?? "script";
    plan = replaceOneSection(opts.current, fresh, key);
    if (key === "script") {
      for (const p of Object.keys(plan.packages) as (keyof ContentPlan["packages"])[]) {
        if (!opts.locked?.[`pkg.${p}.caption`]) plan.packages[p].script = fresh.packages[p].script;
      }
    }
  } else {
    plan = mergeRespectingLocks(opts.current, fresh, opts.locked ?? {});
  }
  if (!usedAI && wordCount(input.project.idea) === 0 && input.assets.length) {
    notice = [notice, "Add a short description of what's in your media so the copy can name it specifically."].filter(Boolean).join(" ");
  }
  return { plan, notice, usedAI };
}
