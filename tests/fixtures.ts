import { printQueenBrand } from "@/lib/defaultBrand";
import type { MediaAsset, Project } from "@/lib/types";

export function project(over: Partial<Project> = {}): Project {
  return {
    id: "p1", brandId: "b1", name: "Test", createdAt: "2026-11-14T00:00:00Z", updatedAt: "2026-11-14T00:00:00Z",
    stage: "setup", mediaIds: [], platforms: ["tiktok", "instagram", "facebook"], objective: "custom_orders",
    tone: "confident", speakingStyle: "voiceover", idea: "custom photo keychain for a bridal party", facts: "",
    speakingRateWpm: 150, locked: {}, ...over,
  };
}

export function image(over: Partial<MediaAsset> = {}): MediaAsset {
  return {
    id: "img1", projectId: "p1", brandId: "b1", kind: "image", name: "keychain.jpg", mime: "image/jpeg", size: 1000, order: 0,
    thumbnail: "data:image/jpeg;base64,AAAA", createdAt: "2026-11-14T00:00:00Z",
    tech: { width: 3024, height: 4032, orientation: "vertical", aspect: "3:4", sharpness: 70, brightness: 55, notes: [] },
    ...over,
  };
}

export function video(over: Partial<MediaAsset> = {}): MediaAsset {
  return {
    id: "vid1", projectId: "p1", brandId: "b1", kind: "video", name: "unbox.mov", mime: "video/quicktime", size: 50_000_000, order: 0,
    thumbnail: "data:image/jpeg;base64,AAAA", createdAt: "2026-11-14T00:00:00Z",
    tech: {
      width: 1080, height: 1920, orientation: "vertical", aspect: "9:16", durationSec: 42, sharpness: 50, brightness: 50, notes: [],
      frames: [
        { t: 2.6, dataUrl: "data:,", sharpness: 15, brightness: 40 },
        { t: 10.5, dataUrl: "data:,", sharpness: 70, brightness: 55 },
        { t: 18.4, dataUrl: "data:,", sharpness: 55, brightness: 50 },
        { t: 26.3, dataUrl: "data:,", sharpness: 60, brightness: 18 },
        { t: 34.1, dataUrl: "data:,", sharpness: 40, brightness: 50 },
      ],
    },
    ...over,
  };
}

export const brand = () => ({ ...printQueenBrand(), id: "b1" });
