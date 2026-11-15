import type { Platform } from "./types";

/**
 * Platform rule adapters. Every number here can change — update this file (not the app logic)
 * when a platform changes its rules. Each rule records where it came from and when it was checked.
 */
export interface PlatformRules {
  id: Platform;
  checkedOn: string;
  sources: { label: string; url: string }[];
  captionMax: number; // characters, using the strictest documented limit for scheduled/API posting
  captionMaxNative?: number;
  hashtagMax: number;
  hashtagGuidance: string;
  video: { minSec: number; shortFormMaxSec: number; maxSec: number; width: number; height: number };
  storyMaxSec: number;
  postTypes: string[];
  styleNotes: string; // how copy should differ on this platform
  publishing: { phase: 2 | 3; requires: string[]; note: string };
}

export const RULES: Record<Platform, PlatformRules> = {
  tiktok: {
    id: "tiktok",
    checkedOn: "2026-11-14",
    sources: [
      { label: "TikTok Content Posting API (caption 2,200 UTF-16 units for video posts)", url: "https://developers.tiktok.com/doc/content-posting-api-reference-direct-post" },
      { label: "TikTok in-app caption limit 4,000 characters (third-party summary)", url: "https://www.sendcove.app/integrations/tiktok/character-limits" },
    ],
    captionMax: 2200,
    captionMaxNative: 4000,
    hashtagMax: 5,
    hashtagGuidance: "Use a few specific tags (up to 5). TikTok search reads your caption and spoken words, so keywords in plain sentences matter more than tag volume.",
    video: { minSec: 3, shortFormMaxSec: 60, maxSec: 600, width: 1080, height: 1920 },
    storyMaxSec: 15,
    postTypes: ["Video", "Photo carousel", "Story"],
    styleNotes: "Conversational, first person, fast first line. Hook in the first 1–2 seconds. Captions short; keywords in plain language.",
    publishing: { phase: 3, requires: ["TikTok developer app", "Content Posting API audit"], note: "Unaudited apps can only post privately; public posting requires TikTok's audit." },
  },
  instagram: {
    id: "instagram",
    checkedOn: "2026-11-14",
    sources: [
      { label: "Instagram limits hashtags to 5 per post and Reel (Dec 2025)", url: "https://www.socialmediatoday.com/news/instagram-implements-new-limits-on-hashtag-use/808309/" },
      { label: "Instagram Reels up to 3 minutes", url: "https://routenote.com/blog/instagram-expands-reels-limit-to-3-minutes/" },
    ],
    captionMax: 2200,
    hashtagMax: 5,
    hashtagGuidance: "Instagram now allows at most 5 hashtags per post or Reel. Pick specific niche and local tags; put keywords in the caption.",
    video: { minSec: 3, shortFormMaxSec: 90, maxSec: 180, width: 1080, height: 1920 },
    storyMaxSec: 60,
    postTypes: ["Reel", "Feed photo", "Carousel", "Story"],
    styleNotes: "Polished and visual. First line works as a headline above 'more'. Save-worthy detail and a clear CTA; link goes in bio or DM.",
    publishing: { phase: 3, requires: ["Meta developer app", "Instagram professional account", "App review for publishing permissions"], note: "Personal Instagram accounts can't be published to through the API." },
  },
  facebook: {
    id: "facebook",
    checkedOn: "2026-11-14",
    sources: [
      { label: "Facebook Reels 3–90 seconds (Headliner limits guide)", url: "https://learn.headliner.app/hc/en-us/articles/34164986965271-Social-Media-Video-Length-Limits-2025" },
    ],
    captionMax: 63206,
    hashtagMax: 3,
    hashtagGuidance: "Facebook doesn't rely on hashtags much; 1–3 specific tags at most. Clear description and a link work better.",
    video: { minSec: 3, shortFormMaxSec: 90, maxSec: 90, width: 1080, height: 1920 },
    storyMaxSec: 120,
    postTypes: ["Reel", "Page photo post", "Page video post", "Story"],
    styleNotes: "Slightly longer, warmer, community tone. Explain who it's for and how to order; clickable links work in Page posts.",
    publishing: { phase: 3, requires: ["Meta developer app", "Facebook Page", "App review for pages_manage_posts"], note: "Personal profiles can't be published to through the API — Pages only." },
  },
};

export function validateCaption(platform: Platform, caption: string, hashtags: string[]) {
  const r = RULES[platform];
  const issues: string[] = [];
  const full = caption + (hashtags.length ? "\n\n" + hashtags.join(" ") : "");
  if (full.length > r.captionMax) issues.push(`Caption is ${full.length} characters; ${platform} allows ${r.captionMax}.`);
  if (hashtags.length > r.hashtagMax) issues.push(`${hashtags.length} hashtags; recommended max here is ${r.hashtagMax}.`);
  return { ok: issues.length === 0, issues, length: full.length };
}
