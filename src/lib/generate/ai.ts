"use client";
import { LIMITS } from "../config";
import { dataUrlToBase64, blobToBase64 } from "../media";
import { RULES } from "../platforms";
import { supabase } from "../store";
import type { ContentPlan, MediaAsset, MediaUnderstanding, Platform, ScriptSegment, SectionKey } from "../types";
import { PLATFORMS } from "../types";
import { deepClone, uid } from "../util";
import type { GenInput } from "./template";

export class AIUnavailable extends Error {
  constructor(public code: string, msg: string) { super(msg); }
}

async function call<T>(body: Record<string, unknown>): Promise<{ result: T; provider: string; model: string }> {
  const sb = supabase();
  if (!sb) throw new AIUnavailable("not_configured", "AI isn't connected in this-device mode.");
  const { data, error } = await sb.functions.invoke("ai", { body });
  if (error) {
    let detail = "";
    try { detail = (await (error as { context?: Response }).context?.json())?.error ?? ""; } catch { /* ignore */ }
    throw new AIUnavailable("provider_error", detail || error.message || "The AI service didn't respond.");
  }
  if (!data?.ok) throw new AIUnavailable(data?.code ?? "provider_error", data?.error ?? "The AI service returned an error.");
  return { result: data.result as T, provider: data.provider, model: data.model };
}

// ---------- strict-ish coercion helpers (never trust model output shape) ----------
const str = (v: unknown, max = 4000) => (typeof v === "string" ? v.slice(0, max).trim() : "");
const strs = (v: unknown, n = 20, max = 400) => (Array.isArray(v) ? v.map((x) => str(x, max)).filter(Boolean).slice(0, n) : []);
const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);

/** A timestamp is kept only if it lines up with a frame we actually extracted from that clip. */
export function groundTimestamp(assets: MediaAsset[], assetIndex: unknown, t: unknown, inlineVideoIdx: Set<number>) {
  if (typeof assetIndex !== "number" || typeof t !== "number") return undefined;
  const a = assets[assetIndex];
  if (!a || a.kind !== "video" || !a.tech?.durationSec) return undefined;
  if (t < 0 || t > a.tech.durationSec) return undefined;
  const frames = a.tech.frames ?? [];
  const near = frames.some((f) => Math.abs(f.t - t) <= 0.6);
  if (!near && !inlineVideoIdx.has(assetIndex)) return undefined;
  return { assetId: a.id, t: Math.round(t * 10) / 10 };
}

// ---------- analysis ----------
export async function analyzeWithAI(input: GenInput, getPreview: (a: MediaAsset) => Promise<string | undefined>, getBlob: (a: MediaAsset) => Promise<Blob | undefined>): Promise<MediaUnderstanding> {
  const { brand, project, assets } = input;
  const inline = new Set<number>();
  const media = [];
  for (const [i, a] of assets.entries()) {
    const images: { t?: number; b64: string }[] = [];
    let videoB64: string | undefined;
    if (a.kind === "image") {
      const p = await getPreview(a);
      if (p) images.push({ b64: dataUrlToBase64(p) });
    } else {
      for (const f of a.tech?.frames ?? []) images.push({ t: f.t, b64: dataUrlToBase64(f.dataUrl) });
      if (a.size <= LIMITS.inlineVideoForTranscriptBytes) {
        const b = await getBlob(a);
        if (b) { videoB64 = await blobToBase64(b); inline.add(i); }
      }
    }
    media.push({ index: i, kind: a.kind, name: a.name, mime: a.mime, durationSec: a.tech?.durationSec, width: a.tech?.width, height: a.tech?.height, images, videoB64 });
  }
  const { result: r, provider, model } = await call<Record<string, unknown>>({
    action: "analyze",
    brand: { name: brand.name, niche: brand.niche, products: brand.products, capabilities: brand.capabilities, location: brand.location },
    context: { idea: project.idea, facts: project.facts, objective: project.objective, platforms: project.platforms },
    media,
  });
  const o = (r.observed ?? {}) as Record<string, unknown>;
  const s = (r.suggested ?? {}) as Record<string, unknown>;
  const moments = Array.isArray(o.moments) ? o.moments : [];
  return {
    source: "ai",
    provider, model,
    observed: {
      summary: str(o.summary, 1200),
      subjects: strs(o.subjects),
      products: strs(o.products),
      setting: str(o.setting, 400),
      onScreenText: strs(o.onScreenText),
      transcript: inline.size ? str(o.transcript, 8000) : "",
      activities: strs(o.activities),
      moments: moments.slice(0, 20).map((m: Record<string, unknown>) => {
        const ref = groundTimestamp(assets, m.assetIndex, m.t, inline);
        return { assetId: ref?.assetId ?? assets[m.assetIndex as number]?.id, t: ref?.t, description: str(m.description, 300), usable: m.usable !== false };
      }).filter((m) => m.description),
      qualityNotes: strs(o.qualityNotes),
    },
    suggested: { hooks: strs(s.hooks, 5), audiences: strs(s.audiences, 5), usableSceneOrder: strs(s.usableSceneOrder, 12) },
    clarifyingQuestion: str(r.clarifyingQuestion, 300) || undefined,
    createdAt: new Date().toISOString(),
  };
}

// ---------- generation ----------
function compactInput(input: GenInput) {
  const { brand, project, assets, understanding } = input;
  const { logoDataUrl: _logo, approvedExamples, ...b } = brand;
  return {
    brand: { ...b, approvedExamples: approvedExamples.slice(-5) },
    project: {
      platforms: project.platforms, objective: project.objective, tone: input.toneOverride ?? project.tone,
      singlePictureMode: project.singlePictureMode, speakingStyle: project.speakingStyle, idea: project.idea, facts: project.facts,
      speakingRateWpm: project.speakingRateWpm,
    },
    media: assets.map((a, i) => ({
      index: i, kind: a.kind, durationSec: a.tech?.durationSec, orientation: a.tech?.orientation, sharpness: a.tech?.sharpness, brightness: a.tech?.brightness,
      frameTimes: a.tech?.frames?.map((f) => ({ t: f.t, sharpness: f.sharpness, brightness: f.brightness })), notes: a.tech?.notes,
    })),
    understanding: understanding ? { source: understanding.source, observed: understanding.observed, suggested: understanding.suggested } : null,
    rules: Object.fromEntries(PLATFORMS.map((p) => [p, { captionMax: RULES[p].captionMax, hashtagMax: RULES[p].hashtagMax, style: RULES[p].styleNotes, shortFormMaxSec: RULES[p].video.shortFormMaxSec }])),
  };
}

export async function generateWithAI(input: GenInput, base: ContentPlan, opts: { section?: SectionKey; instruction?: string; current?: ContentPlan } = {}): Promise<ContentPlan> {
  const { result: r, provider } = await call<Record<string, unknown>>({
    action: "generate",
    ...compactInput(input),
    section: opts.section ?? null,
    instruction: opts.instruction ?? null,
    current: opts.current ? { hooks: opts.current.hooks, segments: opts.current.segments.map(({ id: _id, ...s }) => s), targetDurationSec: opts.current.targetDurationSec } : null,
  });
  return coercePlan(r, base, input.assets, provider);
}

/** Overlay validated AI fields onto the template plan (which supplies structure, times and rights notes). */
export function coercePlan(r: Record<string, unknown>, base: ContentPlan, assets: MediaAsset[], provider = "ai"): ContentPlan {
  const out = deepClone(base);
  out.generatedBy = "ai";
  out.provider = provider;
  out.generatedAt = new Date().toISOString();
  const c = (r.concept ?? {}) as Record<string, unknown>;
  if (str(c.title)) out.concept = { title: str(c.title, 120), angle: str(c.angle, 400), why: str(c.why, 600) };
  const hooks = Array.isArray(r.hooks) ? r.hooks.map((h: Record<string, unknown>) => ({ text: str(h?.text, 200), style: str(h?.style, 40) || "Hook" })).filter((h) => h.text).slice(0, 3) : [];
  if (hooks.length === 3) {
    out.hooks = hooks;
    const rh = (r.recommendedHook ?? {}) as Record<string, unknown>;
    out.recommendedHook = { index: num(rh.index, 0, 2, 0), reason: str(rh.reason, 400) || out.recommendedHook.reason };
  }
  out.targetDurationSec = Math.round(num(r.targetDurationSec, 3, 180, out.targetDurationSec));
  out.durationReason = str(r.durationReason, 400) || out.durationReason;
  if (Array.isArray(r.segments) && r.segments.length) {
    out.segments = r.segments.slice(0, 12).map((s: Record<string, unknown>): ScriptSegment => ({
      id: uid(),
      label: str(s.label, 40) || "Scene",
      spoken: str(s.spoken, 1200),
      onScreen: str(s.onScreen, 120),
      visual: str(s.visual, 400),
      direction: str(s.direction, 400),
      demoSec: num(s.demoSec, 0, 30, 0),
      sourceRef: groundTimestamp(assets, s.assetIndex, s.t, new Set()),
    }));
  }
  out.shortScript = str(r.shortScript, 1200) || out.shortScript;
  out.altAngle = str(r.altAngle, 600) || out.altAngle;
  const ep = strs(r.editPlan, 12, 300);
  if (ep.length) out.editPlan = [...ep, "Timing here is an estimated storyboard. Exact cut points come from the editor in Phase 3."];
  const mf = strs(r.missingFootage, 6, 300);
  if (mf.length) out.missingFootage = mf;
  if (out.photo && r.photo && typeof r.photo === "object") {
    const p = r.photo as Record<string, unknown>;
    const caps = strs(p.captions, 3, 2200);
    if (caps.length === 3) out.photo.captions = caps;
    out.photo.headline = str(p.headline, 120) || out.photo.headline;
    out.photo.overlay = str(p.overlay, 120) || out.photo.overlay;
    out.photo.audience = str(p.audience, 400) || out.photo.audience;
    out.photo.altText = str(p.altText, 1000) || out.photo.altText;
  }
  const pk = (r.packages ?? {}) as Record<string, Record<string, unknown>>;
  for (const pl of PLATFORMS as Platform[]) {
    const x = pk[pl];
    if (!x) continue;
    const dst = out.packages[pl];
    dst.postType = str(x.postType, 60) || dst.postType;
    dst.angle = str(x.angle, 200) || dst.angle;
    dst.hook = str(x.hook, 200) || dst.hook;
    dst.caption = (str(x.caption, RULES[pl].captionMax) || dst.caption);
    dst.shortCaption = str(x.shortCaption, 300) || dst.shortCaption;
    dst.coverHeadline = str(x.coverHeadline, 80) || dst.coverHeadline;
    dst.cta = str(x.cta, 80) || dst.cta;
    dst.explanation = str(x.explanation, 600) || dst.explanation;
    const ost = strs(x.onScreenText, 12, 120);
    if (ost.length) dst.onScreenText = ost;
    const sp = strs(x.searchPhrases, 8, 80);
    if (sp.length) dst.searchPhrases = sp;
    if (Array.isArray(x.hashtags)) {
      const tags = x.hashtags.map((h: Record<string, unknown>) => {
        const t = str(h?.tag, 60).replace(/\s+/g, "");
        return { tag: t.startsWith("#") ? t : "#" + t, purpose: str(h?.purpose, 200) || "Relevant to this post.", evidence: "inferred" as const };
      }).filter((h) => h.tag.length > 2).slice(0, RULES[pl].hashtagMax);
      if (tags.length) dst.hashtags = tags;
    }
    if (str(x.script, 4000)) dst.script = str(x.script, 4000);
    const aud = str(x.audioStyle, 300);
    // AI only describes a style. It cannot verify a track's popularity or license.
    if (aud && dst.audio.evidence !== "verified") dst.audio = { ...dst.audio, suggestion: aud, evidence: "general" };
  }
  const cv = (r.cover ?? {}) as Record<string, unknown>;
  const ch = (cv.headlines ?? {}) as Record<string, unknown>;
  if (str(ch.curiosity)) out.cover.headlines = { curiosity: str(ch.curiosity, 80), premium: str(ch.premium, 80) || out.cover.headlines.premium, direct: str(ch.direct, 80) || out.cover.headlines.direct };
  const ideas = strs(r.ideas, 6, 200);
  if (ideas.length) out.ideas = ideas;
  return out;
}
