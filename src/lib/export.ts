import { estimateDuration, DEFAULT_WPM } from "./duration";
import type { BrandProfile, ContentPlan, Platform, PlatformPackage, Project } from "./types";
import { EVIDENCE_LABEL, PLATFORM_LABEL } from "./types";

export function packageText(pkg: PlatformPackage): string {
  const tags = pkg.hashtags.map((h) => h.tag).join(" ");
  return [pkg.caption, tags].filter(Boolean).join("\n\n");
}

export function fullPackageText(pkg: PlatformPackage): string {
  return [
    `${PLATFORM_LABEL[pkg.platform]} — ${pkg.postType}`,
    `Hook: ${pkg.hook}`,
    pkg.script ? `Script (say this): ${pkg.script}` : "",
    pkg.durationSec ? `Target length: ${pkg.durationSec}s` : "",
    pkg.onScreenText.length ? `On-screen text:\n${pkg.onScreenText.map((t) => `• ${t}`).join("\n")}` : "",
    `Caption:\n${pkg.caption}`,
    `Short caption: ${pkg.shortCaption}`,
    `Cover headline: ${pkg.coverHeadline}`,
    `Hashtags: ${pkg.hashtags.map((h) => h.tag).join(" ")}`,
    `Search phrases: ${pkg.searchPhrases.join(", ")}`,
    `Audio: ${pkg.audio.suggestion}${pkg.audio.rightsNote ? `\n  ${pkg.audio.rightsNote}` : ""}`,
    `Call to action: ${pkg.cta}`,
    `When to post:\n${pkg.postingWindows.map((w) => `• ${w.rank === "best" ? "Best" : w.rank === "second" ? "Second" : "Test"}: ${w.label} — ${w.why} (${EVIDENCE_LABEL[w.evidence]}, ${w.confidence} confidence)`).join("\n")}`,
  ].filter(Boolean).join("\n\n");
}

export function planMarkdown(plan: ContentPlan, project: Project, brand: BrandProfile): string {
  const est = estimateDuration(plan.segments, project.speakingRateWpm || DEFAULT_WPM);
  const L: string[] = [];
  L.push(`# ${project.name}`);
  L.push(`${brand.name} · Goal: ${project.objective.replace(/_/g, " ")} · Written by: ${plan.generatedBy === "ai" ? `AI (${plan.provider})` : "template writer (no AI)"} · ${new Date(plan.generatedAt).toLocaleString()}`);
  L.push(`\n## Concept\n**${plan.concept.title}**\n\n${plan.concept.angle}\n\n${plan.concept.why}`);
  L.push(`\n## Hooks`);
  plan.hooks.forEach((h, i) => L.push(`${i + 1}. ${h.text} _(${h.style})_${i === plan.recommendedHook.index ? " ← recommended" : ""}`));
  L.push(`\nWhy: ${plan.recommendedHook.reason}`);
  if (project.singlePictureMode !== "photo") {
    L.push(`\n## Script — target ${plan.targetDurationSec}s (estimated ${est.totalSec.toFixed(1)}s at ${project.speakingRateWpm} wpm)`);
    L.push(plan.durationReason);
    plan.segments.forEach((s, i) => {
      L.push(`\n### ${i + 1}. ${s.label}`);
      if (s.spoken) L.push(`**Say:** "${s.spoken}"`);
      if (s.onScreen) L.push(`**On screen:** ${s.onScreen}`);
      L.push(`**Visual:** ${s.visual}`);
      if (s.direction) L.push(`**Direction:** ${s.direction}`);
    });
    L.push(`\n### Short version\n${plan.shortScript}`);
    L.push(`\n### Alternate angle\n${plan.altAngle}`);
    L.push(`\n## Edit plan (estimated storyboard — not a rendered video)\n${plan.editPlan.map((x) => `- ${x}`).join("\n")}`);
    if (plan.missingFootage.length) L.push(`\n**Missing footage:**\n${plan.missingFootage.map((x) => `- ${x}`).join("\n")}`);
  }
  if (plan.photo) {
    L.push(`\n## Photo post`);
    L.push(`**Headline:** ${plan.photo.headline}\n\n**Text overlay:** ${plan.photo.overlay}\n\n**Audience:** ${plan.photo.audience}`);
    L.push(`\n**Caption options:**\n${plan.photo.captions.map((c, i) => `${i + 1}. ${c}`).join("\n")}`);
    L.push(`\n**Alt text (review before posting):** ${plan.photo.altText}`);
  }
  for (const p of project.platforms) {
    L.push(`\n## ${PLATFORM_LABEL[p]}\n`);
    L.push("```\n" + fullPackageText(plan.packages[p]) + "\n```");
    L.push(`Why this works here: ${plan.packages[p].explanation}`);
  }
  L.push(`\n## Cover\n${plan.cover.reason}\n- Curiosity: ${plan.cover.headlines.curiosity}\n- Premium: ${plan.cover.headlines.premium}\n- Direct: ${plan.cover.headlines.direct}`);
  L.push(`\n---\nRecommendations are guidance and testable hypotheses — not guarantees of reach, followers, or sales. Hashtags are labeled by evidence; none are verified trend data unless marked so.`);
  return L.join("\n");
}

export function shotListCsv(plan: ContentPlan): string {
  const esc = (s: string | number) => `"${String(s).replace(/"/g, '""')}"`;
  const rows = [["#", "Scene", "Visual / what to film", "Say", "On-screen text", "Direction", "Approx seconds"]];
  const est = estimateDuration(plan.segments);
  plan.segments.forEach((s, i) => rows.push([String(i + 1), s.label, s.visual, s.spoken, s.onScreen, s.direction, est.segments[i].totalSec.toFixed(1)]));
  return rows.map((r) => r.map(esc).join(",")).join("\n");
}

function ts(sec: number, sep: "," | ".") {
  const ms = Math.round(sec * 1000);
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000), r = ms % 1000;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}${sep}${String(r).padStart(3, "0")}`;
}

/** Subtitles with ESTIMATED timing from the speaking rate. Adjust after filming. */
export function subtitles(plan: ContentPlan, wpm = DEFAULT_WPM, format: "srt" | "vtt" = "srt"): string {
  const est = estimateDuration(plan.segments, wpm);
  let t = 0;
  const cues: { a: number; b: number; text: string }[] = [];
  plan.segments.forEach((s, i) => {
    const seg = est.segments[i];
    const text = (s.spoken || s.onScreen).trim();
    if (text) {
      const words = text.split(/\s+/);
      const chunks: string[] = [];
      for (let k = 0; k < words.length; k += 7) chunks.push(words.slice(k, k + 7).join(" "));
      const per = (seg.speakSec + seg.pauseSec || seg.demoSec) / chunks.length;
      chunks.forEach((c, k) => cues.push({ a: t + k * per, b: t + (k + 1) * per, text: c }));
    }
    t += seg.totalSec + 0.3;
  });
  if (format === "vtt") {
    return "WEBVTT\n\nNOTE Timing is estimated from the script and speaking rate. Adjust after filming.\n\n" +
      cues.map((c) => `${ts(c.a, ".")} --> ${ts(c.b, ".")}\n${c.text}`).join("\n\n") + "\n";
  }
  return cues.map((c, i) => `${i + 1}\n${ts(c.a, ",")} --> ${ts(c.b, ",")}\n${c.text}`).join("\n\n") + "\n";
}

export function download(name: string, content: string | Blob, mime = "text/plain;charset=utf-8") {
  const blob = typeof content === "string" ? new Blob([content], { type: mime }) : content;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function safeName(s: string) {
  return s.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "contentpilot";
}

export interface CoverOptions {
  headline: string;
  position: "top" | "middle" | "bottom";
  size: number; // px at 1080 wide
  color: string;
  band: boolean; // dark band behind text for contrast
  handle?: string;
  accent: string;
}

/** Renders a real 1080×1920 PNG from the chosen image/frame plus headline. */
export async function renderCover(src: string, o: CoverOptions, w = 1080, h = 1920): Promise<Blob> {
  const img = new Image();
  img.src = src;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, w, h);
  // cover-fit
  const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * s, dh = img.naturalHeight * s;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
  if (o.headline.trim()) {
    ctx.font = `800 ${o.size}px "Bricolage Grotesque Variable", system-ui, sans-serif`;
    const lines = wrap(ctx, o.headline.trim(), w - 160);
    const lh = o.size * 1.12;
    const blockH = lines.length * lh;
    // keep inside the safe zone: away from top UI (~220px) and bottom UI (~420px)
    const y0 = o.position === "top" ? 260 : o.position === "middle" ? (h - blockH) / 2 : h - 460 - blockH;
    if (o.band) {
      ctx.fillStyle = "rgba(0,0,0,0.62)";
      ctx.fillRect(0, y0 - lh * 0.45, w, blockH + lh * 0.6);
      ctx.fillStyle = o.accent;
      ctx.fillRect(80, y0 - lh * 0.45, 10, blockH + lh * 0.6);
    }
    ctx.fillStyle = o.color;
    ctx.textBaseline = "top";
    lines.forEach((ln, i) => ctx.fillText(ln, 110, y0 + i * lh - lh * 0.15));
  }
  if (o.handle) {
    ctx.font = `600 38px system-ui, sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(o.handle, 110, h - 380);
  }
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Couldn't render the cover."))), "image/png"));
}

function wrap(ctx: CanvasRenderingContext2D, text: string, max: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const t = line ? line + " " + w : w;
    if (ctx.measureText(t).width > max && line) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  return lines.slice(0, 5);
}

export const PLATFORM_ORDER: Platform[] = ["tiktok", "instagram", "facebook"];
