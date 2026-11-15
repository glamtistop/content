"use client";
import { analyzeImage, analyzeVideo, normalizeImage, validateFile, VideoDecodeError, VIDEO_DECODE_HELP } from "./media";
import type { Store } from "./store";
import type { BrandProfile, MediaAsset, Project, SpeakingStyle } from "./types";
import { nowISO, uid } from "./util";

export interface UploadItem {
  key: string;
  file: File;
  name: string;
  stage: "checking" | "converting" | "analyzing" | "saving" | "done" | "error";
  progress: number;
  error?: string;
  assetId?: string;
}

/** Large preview images (for AI analysis) live in memory + IndexedDB-free sessionStorage-like cache. */
const previewCache = new Map<string, string>();
export const getCachedPreview = (id: string) => previewCache.get(id);

export async function previewFor(store: Store, a: MediaAsset): Promise<string | undefined> {
  if (a.kind !== "image") return undefined;
  const hit = previewCache.get(a.id);
  if (hit) return hit;
  const blob = await store.getMediaBlob(a);
  if (!blob) return a.thumbnail;
  const { preview } = await analyzeImage(blob);
  previewCache.set(a.id, preview);
  return preview;
}

export async function ingestFile(
  store: Store,
  project: Project,
  file: File,
  order: number,
  onUpdate: (patch: Partial<UploadItem>) => void,
  replaceId?: string,
): Promise<MediaAsset | null> {
  try {
    onUpdate({ stage: "checking", progress: 0.02 });
    const v = await validateFile(file);
    if (!v.ok) { onUpdate({ stage: "error", error: v.error }); return null; }
    let blob: Blob = file;
    let mime = v.mime;
    let name = file.name;
    if (v.kind === "image") {
      if (mime === "image/heic" || mime === "image/heif") onUpdate({ stage: "converting", progress: 0.1 });
      const n = await normalizeImage(file, mime);
      blob = n.blob; mime = n.mime;
      if (n.converted) name = name.replace(/\.(heic|heif)$/i, ".jpg");
    }
    onUpdate({ stage: "analyzing", progress: 0.2 });
    const asset: MediaAsset = {
      id: replaceId ?? uid(), projectId: project.id, brandId: project.brandId, kind: v.kind, name, mime, size: blob.size,
      order, thumbnail: "", createdAt: nowISO(),
    };
    if (v.kind === "image") {
      const r = await analyzeImage(blob);
      asset.tech = r.tech; asset.thumbnail = r.thumbnail;
      previewCache.set(asset.id, r.preview);
    } else {
      try {
        const r = await analyzeVideo(blob, (f) => onUpdate({ progress: 0.2 + f * 0.4 }));
        asset.tech = r.tech; asset.thumbnail = r.thumbnail;
      } catch (e) {
        if (!(e instanceof VideoDecodeError)) throw e;
        asset.tech = { width: 0, height: 0, orientation: "vertical", aspect: "?", sharpness: 0, brightness: 0, notes: [VIDEO_DECODE_HELP] };
      }
    }
    onUpdate({ stage: "saving", progress: 0.6 });
    await store.putMediaBlob(asset, blob, (f) => onUpdate({ progress: 0.6 + f * 0.38 }));
    await store.saveMediaMeta(asset);
    onUpdate({ stage: "done", progress: 1, assetId: asset.id });
    return asset;
  } catch (e) {
    onUpdate({ stage: "error", error: (e as Error).message || "Something went wrong reading this file." });
    return null;
  }
}

export function newProject(brand: BrandProfile, opts: { name?: string; idea?: string; speakingStyle?: SpeakingStyle } = {}): Project {
  const t = nowISO();
  const d = new Date();
  return {
    id: uid(),
    brandId: brand.id,
    name: opts.name || `Post — ${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })} ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`,
    createdAt: t,
    updatedAt: t,
    stage: "media",
    mediaIds: [],
    platforms: ["tiktok", "instagram", "facebook"],
    objective: brand.objective,
    tone: brand.tone,
    speakingStyle: opts.speakingStyle ?? (brand.onCamera ? "talking" : brand.formatPrefs.voiceover ? "voiceover" : "text_only"),
    idea: opts.idea ?? "",
    facts: "",
    speakingRateWpm: 150,
    locked: {},
  };
}
