"use client";
import { LIMITS } from "./config";
import type { TechAnalysis } from "./types";
import { clamp, fmtBytes } from "./util";

export type Kind = "image" | "video";
const EXT: Record<string, { kind: Kind; mime: string }> = {
  jpg: { kind: "image", mime: "image/jpeg" }, jpeg: { kind: "image", mime: "image/jpeg" },
  png: { kind: "image", mime: "image/png" }, webp: { kind: "image", mime: "image/webp" },
  heic: { kind: "image", mime: "image/heic" }, heif: { kind: "image", mime: "image/heif" },
  mp4: { kind: "video", mime: "video/mp4" }, mov: { kind: "video", mime: "video/quicktime" }, m4v: { kind: "video", mime: "video/mp4" },
};
export const ACCEPT = ".jpg,.jpeg,.png,.webp,.heic,.heif,.mp4,.mov,.m4v,image/*,video/mp4,video/quicktime";

/** Checks extension, declared type AND the file's first bytes, so renamed files are caught. */
export async function validateFile(file: File): Promise<{ ok: true; kind: Kind; mime: string } | { ok: false; error: string }> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const byExt = EXT[ext];
  const head = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  const ascii = (a: number, b: number) => String.fromCharCode(...head.slice(a, b));
  let sniff: { kind: Kind; mime: string } | null = null;
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) sniff = EXT.jpg;
  else if (head[0] === 0x89 && ascii(1, 4) === "PNG") sniff = EXT.png;
  else if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") sniff = EXT.webp;
  else if (ascii(4, 8) === "ftyp") {
    const brand = ascii(8, 12);
    if (/^(heic|heix|hevc|hevx|mif1|msf1|heim|heis)$/.test(brand)) sniff = EXT.heic;
    else if (brand === "qt  ") sniff = EXT.mov;
    else sniff = EXT.mp4;
  } else if (["moov", "wide", "mdat", "free", "skip"].includes(ascii(4, 8))) sniff = EXT.mov;

  if (!sniff) return { ok: false, error: `${file.name} isn't a supported photo or video. Use JPG, PNG, WEBP, HEIC, MP4 or MOV.` };
  if (byExt && byExt.kind !== sniff.kind) return { ok: false, error: `${file.name} says it's a ${byExt.kind} but its contents look like a ${sniff.kind}. Re-export the file and try again.` };
  const limit = sniff.kind === "image" ? LIMITS.imageBytes : LIMITS.videoBytes;
  if (file.size > limit) {
    const fix = sniff.kind === "video"
      ? LIMITS.planCapped
        ? " Trim it to the part you need, or re-export at 1080p (iPhone: Settings → Camera → Record Video → 1080p HD). Your storage plan accepts up to 50 MB per file; upgrading Supabase to Pro lifts this (see the setup guide)."
        : " Trim it or re-export at 1080p first."
      : " Save it as a smaller JPG first.";
    return { ok: false, error: `${file.name} is ${fmtBytes(file.size)}. The limit for ${sniff.kind}s is ${fmtBytes(limit)}.${fix}` };
  }
  if (file.size === 0) return { ok: false, error: `${file.name} is empty.` };
  return { ok: true, kind: sniff.kind, mime: sniff.mime };
}

/** HEIC → JPEG so every browser can preview and analyze it. Other images pass through. */
export async function normalizeImage(file: File, mime: string): Promise<{ blob: Blob; mime: string; converted: boolean }> {
  if (mime !== "image/heic" && mime !== "image/heif") return { blob: file, mime, converted: false };
  // Safari can decode HEIC natively; try that first.
  try {
    const bmp = await createImageBitmap(file);
    const c = document.createElement("canvas");
    c.width = bmp.width; c.height = bmp.height;
    c.getContext("2d")!.drawImage(bmp, 0, 0);
    const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("encode failed"))), "image/jpeg", 0.92));
    return { blob, mime: "image/jpeg", converted: true };
  } catch { /* fall through */ }
  const heic2any = (await import("heic2any")).default;
  const out = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.92 });
  return { blob: Array.isArray(out) ? out[0] : out, mime: "image/jpeg", converted: true };
}

// ---------- pixel measurements ----------
function measure(src: CanvasImageSource, w: number, h: number) {
  const size = 256;
  const s = Math.min(1, size / Math.max(w, h));
  const cw = Math.max(8, Math.round(w * s)), ch = Math.max(8, Math.round(h * s));
  const c = document.createElement("canvas");
  c.width = cw; c.height = ch;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(src, 0, 0, cw, ch);
  const d = ctx.getImageData(0, 0, cw, ch).data;
  const g = new Float32Array(cw * ch);
  let sum = 0;
  for (let i = 0; i < cw * ch; i++) {
    const v = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    g[i] = v; sum += v;
  }
  // variance of the Laplacian — standard focus measure
  let lsum = 0, lsq = 0, n = 0;
  for (let y = 1; y < ch - 1; y++) for (let x = 1; x < cw - 1; x++) {
    const i = y * cw + x;
    const l = g[i - 1] + g[i + 1] + g[i - cw] + g[i + cw] - 4 * g[i];
    lsum += l; lsq += l * l; n++;
  }
  const mean = lsum / n;
  const variance = lsq / n - mean * mean;
  const sharpness = clamp(((Math.log10(variance + 1) - 1) / 2.2) * 100, 0, 100);
  const brightness = clamp((sum / (cw * ch) / 255) * 100, 0, 100);
  return { sharpness: Math.round(sharpness), brightness: Math.round(brightness) };
}

function toDataUrl(src: CanvasImageSource, w: number, h: number, max: number, q = 0.72) {
  const s = Math.min(1, max / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.round(w * s); c.height = Math.round(h * s);
  c.getContext("2d")!.drawImage(src, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", q);
}

function orient(w: number, h: number): TechAnalysis["orientation"] {
  const r = w / h;
  return r > 1.05 ? "horizontal" : r < 0.95 ? "vertical" : "square";
}
function aspect(w: number, h: number) {
  const r = w / h;
  const known: [number, string][] = [[9 / 16, "9:16"], [3 / 4, "3:4"], [4 / 5, "4:5"], [1, "1:1"], [4 / 3, "4:3"], [16 / 9, "16:9"], [3 / 2, "3:2"], [2 / 3, "2:3"]];
  const best = known.reduce((a, b) => (Math.abs(b[0] - r) < Math.abs(a[0] - r) ? b : a));
  return Math.abs(best[0] - r) < 0.03 ? best[1] : `${(r).toFixed(2)}:1`;
}

function qualityNotes(t: { sharpness: number; brightness: number; orientation: string; width: number; height: number }, kind: Kind) {
  const n: string[] = [];
  if (t.sharpness < 22) n.push("Looks soft or out of focus.");
  else if (t.sharpness > 60) n.push("Sharp, clear detail.");
  if (t.brightness < 22) n.push("Underexposed (dark).");
  else if (t.brightness > 88) n.push("Very bright — check for blown highlights.");
  if (Math.min(t.width, t.height) < 720) n.push(`Low resolution (${t.width}×${t.height}).`);
  if (kind === "video" && t.orientation !== "vertical") n.push(`${t.orientation[0].toUpperCase() + t.orientation.slice(1)} video — will need cropping for 9:16.`);
  return n;
}

export async function analyzeImage(blob: Blob): Promise<{ tech: TechAnalysis; thumbnail: string; preview: string }> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    const w = img.naturalWidth, h = img.naturalHeight;
    const m = measure(img, w, h);
    const base = { width: w, height: h, orientation: orient(w, h), ...m };
    return {
      tech: { ...base, aspect: aspect(w, h), notes: qualityNotes(base, "image") },
      thumbnail: toDataUrl(img, w, h, 360),
      preview: toDataUrl(img, w, h, 1024, 0.82),
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export class VideoDecodeError extends Error {}

export async function analyzeVideo(blob: Blob, onProgress?: (f: number) => void): Promise<{ tech: TechAnalysis; thumbnail: string }> {
  const url = URL.createObjectURL(blob);
  const v = document.createElement("video");
  v.muted = true; v.playsInline = true; v.preload = "auto"; v.crossOrigin = "anonymous";
  v.src = url;
  try {
    await new Promise<void>((res, rej) => {
      const to = setTimeout(() => rej(new VideoDecodeError("timeout")), 20000);
      v.onloadeddata = () => { clearTimeout(to); res(); };
      v.onerror = () => { clearTimeout(to); rej(new VideoDecodeError("decode")); };
    });
    const w = v.videoWidth, h = v.videoHeight, dur = v.duration;
    if (!w || !h || !isFinite(dur)) throw new VideoDecodeError("no frames");
    const count = clamp(Math.round(dur / 2.5), 3, 12);
    const frames: NonNullable<TechAnalysis["frames"]> = [];
    for (let i = 0; i < count; i++) {
      const t = Math.min(dur - 0.05, (dur * (i + 0.5)) / count);
      await new Promise<void>((res) => {
        const done = () => { v.removeEventListener("seeked", done); res(); };
        v.addEventListener("seeked", done);
        v.currentTime = t;
        setTimeout(done, 4000);
      });
      const m = measure(v, w, h);
      frames.push({ t: Math.round(v.currentTime * 10) / 10, dataUrl: toDataUrl(v, w, h, 480, 0.7), ...m });
      onProgress?.((i + 1) / count);
    }
    const avg = (k: "sharpness" | "brightness") => Math.round(frames.reduce((s, f) => s + f[k], 0) / frames.length);
    const anyV = v as HTMLVideoElement & { mozHasAudio?: boolean; webkitAudioDecodedByteCount?: number; audioTracks?: { length: number } };
    const hasAudioTrack = anyV.mozHasAudio ?? (anyV.audioTracks ? anyV.audioTracks.length > 0 : null);
    const base = { width: w, height: h, orientation: orient(w, h), sharpness: avg("sharpness"), brightness: avg("brightness") };
    const best = frames.slice().sort((a, b) => b.sharpness - a.sharpness)[0];
    return {
      tech: { ...base, aspect: aspect(w, h), durationSec: Math.round(dur * 10) / 10, frames, hasAudioTrack, notes: qualityNotes(base, "video") },
      thumbnail: best.dataUrl,
    };
  } finally {
    v.removeAttribute("src"); v.load();
    URL.revokeObjectURL(url);
  }
}

export const VIDEO_DECODE_HELP =
  "This browser couldn't decode the video (iPhone HEVC videos often do this outside Safari). It's saved; open this project in Safari, or set iPhone Camera → Formats → Most Compatible and re-upload.";

export function dataUrlToBase64(d: string) {
  return d.slice(d.indexOf(",") + 1);
}

export async function blobToBase64(b: Blob): Promise<string> {
  const buf = new Uint8Array(await b.arrayBuffer());
  let s = "";
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}
