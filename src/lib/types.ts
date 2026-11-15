// Core data model. The same shapes are stored locally (IndexedDB) and in Supabase (jsonb),
// so projects keep one structure across all build phases.

export type Platform = "tiktok" | "instagram" | "facebook";
export const PLATFORMS: Platform[] = ["tiktok", "instagram", "facebook"];
export const PLATFORM_LABEL: Record<Platform, string> = {
  tiktok: "TikTok",
  instagram: "Instagram",
  facebook: "Facebook",
};

/** How much a recommendation can be trusted. Every hashtag, trend, sound and time carries one. */
export type Evidence = "verified" | "cached" | "inferred" | "general" | "demo";
export const EVIDENCE_LABEL: Record<Evidence, string> = {
  verified: "Verified current data",
  cached: "Cached data",
  inferred: "Inferred recommendation",
  general: "General guidance",
  demo: "Demo data",
};

export type Objective =
  | "views" | "followers" | "engagement" | "website" | "leads"
  | "bookings" | "custom_orders" | "bulk_buyers" | "new_product" | "awareness";
export const OBJECTIVES: { id: Objective; label: string }[] = [
  { id: "views", label: "Get more views" },
  { id: "followers", label: "Gain followers" },
  { id: "engagement", label: "Increase engagement" },
  { id: "website", label: "Drive website visits" },
  { id: "leads", label: "Generate leads" },
  { id: "bookings", label: "Get bookings" },
  { id: "custom_orders", label: "Generate custom orders" },
  { id: "bulk_buyers", label: "Attract bulk buyers" },
  { id: "new_product", label: "Promote a new product" },
  { id: "awareness", label: "Build brand awareness" },
];

export type Tone =
  | "confident" | "luxury" | "casual" | "funny" | "educational"
  | "inspirational" | "bold" | "trend" | "custom";
export const TONES: { id: Tone; label: string }[] = [
  { id: "confident", label: "Confident business owner" },
  { id: "luxury", label: "Luxury and sophisticated" },
  { id: "casual", label: "Casual and relatable" },
  { id: "funny", label: "Funny and playful" },
  { id: "educational", label: "Educational" },
  { id: "inspirational", label: "Inspirational" },
  { id: "bold", label: "Bold and energetic" },
  { id: "trend", label: "Trend-driven" },
  { id: "custom", label: "Custom tone" },
];

export type CapabilityStatus = "tested" | "available" | "experimental" | "unavailable";

export interface BrandProfile {
  id: string;
  name: string;
  niche: string;
  website: string;
  handles: Record<Platform, string>;
  accountTypes: Record<Platform, string>; // e.g. "Business", "Creator", "Personal", "Page"
  location: string;
  creatorTimezone: string;
  platformTimezones: Record<Platform, string>;
  audienceTimezones: string[];
  targetAudience: string;
  audienceLocations: string;
  languages: string;
  equipment: string[];
  products: string[];
  capabilities: { name: string; status: CapabilityStatus }[];
  buyingMotivations: string;
  salesChannels: string;
  pricing: string;
  ctas: string[];
  colors: { primary: string; secondary: string; accent: string; detail: string };
  logoDataUrl?: string;
  vocabulary: string;
  avoid: string;
  contentUse: "personal" | "commercial" | "sponsored" | "paid_ad";
  onCamera: boolean;
  formatPrefs: { voiceover: boolean; captions: boolean; music: boolean; textOnly: boolean };
  tone: Tone;
  customTone: string;
  musicStyles: string;
  excludedMusic: string;
  objective: Objective;
  /** Only scripts the user explicitly saved as "preferred" become voice examples. */
  approvedExamples: string[];
  onboarded: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TechAnalysis {
  width: number;
  height: number;
  orientation: "vertical" | "horizontal" | "square";
  aspect: string;
  durationSec?: number;
  /** 0–100, from Laplacian variance on a downscaled frame. */
  sharpness: number;
  /** 0–100 mean luma. */
  brightness: number;
  /** Frames sampled from the actual video, with their real source timestamps. */
  frames?: { t: number; dataUrl: string; sharpness: number; brightness: number }[];
  hasAudioTrack?: boolean | null;
  notes: string[];
}

export interface MediaAsset {
  id: string;
  projectId: string;
  brandId: string;
  kind: "image" | "video";
  name: string;
  mime: string;
  size: number;
  order: number;
  thumbnail: string; // small JPEG data URL for fast previews
  storagePath?: string; // cloud mode
  tech?: TechAnalysis;
  createdAt: string;
}

export interface ObservedScene {
  assetId?: string;
  t?: number; // seconds, only when tied to a real extracted frame/timestamp
  description: string;
  usable: boolean;
}

export interface MediaUnderstanding {
  source: "ai" | "technical-only";
  provider?: string;
  model?: string;
  observed: {
    summary: string;
    subjects: string[];
    products: string[];
    setting: string;
    onScreenText: string[];
    transcript: string; // "" when no speech was transcribed
    activities: string[];
    moments: ObservedScene[]; // reveals, before/after, demos
    qualityNotes: string[];
  };
  suggested: {
    hooks: string[];
    audiences: string[];
    usableSceneOrder: string[];
  };
  clarifyingQuestion?: string;
  createdAt: string;
}

export type SinglePictureMode = "photo" | "short_video" | "voiceover" | "talking" | "story" | "carousel";
export type SpeakingStyle = "talking" | "voiceover" | "text_only" | "music_only" | "combo";

export interface ScriptSegment {
  id: string;
  label: string; // "Hook", "Reveal", "CTA"...
  spoken: string; // exact words to say ("" for silent segments)
  onScreen: string; // on-screen text, kept separate from speech
  visual: string; // what's on screen / what to film
  direction: string; // pauses, transitions, demo instructions
  demoSec: number; // extra seconds of silent demonstration
  sourceRef?: { assetId: string; t?: number }; // only set when grounded in a real timestamp
}

export interface HashtagRec { tag: string; purpose: string; evidence: Evidence }
export interface PostingWindow {
  rank: "best" | "second" | "test";
  startISO: string; // exact instant
  label: string; // formatted in creator tz
  timezone: string;
  why: string;
  evidence: Evidence;
  confidence: "low" | "medium" | "high";
  dataNote: string;
}

export interface PlatformPackage {
  platform: Platform;
  postType: string;
  angle: string;
  hook: string;
  script: string; // full spoken script (may be "" for photo posts)
  durationSec?: number;
  onScreenText: string[];
  caption: string;
  shortCaption: string;
  coverHeadline: string;
  hashtags: HashtagRec[];
  searchPhrases: string[];
  audio: { suggestion: string; evidence: Evidence; rightsNote: string };
  postingWindows: PostingWindow[];
  cta: string;
  explanation: string;
  workflow: string[];
}

export interface ReadinessCheck { id: string; label: string; points: number; max: number; tip?: string }
export interface ReadinessReview {
  score: number;
  checks: ReadinessCheck[];
  reach: { level: "Limited" | "Moderate" | "Strong"; why: string };
  sales: { level: "Limited" | "Moderate" | "Strong"; why: string };
  suggestions: string[];
  rejected: string[]; // fabricated claims etc. that were blocked
}

export interface ContentPlan {
  generatedBy: "ai" | "template";
  provider?: string;
  generatedAt: string;
  concept: { title: string; angle: string; why: string };
  hooks: { text: string; style: string }[];
  recommendedHook: { index: number; reason: string };
  speakingStyle: SpeakingStyle;
  targetDurationSec: number;
  durationReason: string;
  segments: ScriptSegment[];
  shortScript: string;
  altAngle: string;
  editPlan: string[]; // trims, keeps, transitions — honest storyboard
  missingFootage: string[];
  photo?: {
    captions: string[];
    headline: string;
    overlay: string;
    audience: string;
    altText: string;
    storyLayout?: string[];
    carouselSlides?: { title: string; body: string; needs: string }[];
    motionPlan?: { effect: string; seconds: number }[];
  };
  packages: Record<Platform, PlatformPackage>;
  cover: {
    assetId?: string;
    frameT?: number;
    reason: string;
    headlines: { curiosity: string; premium: string; direct: string };
  };
  ideas?: string[];
}

/** Section keys that can be regenerated / locked independently. */
export type SectionKey =
  | "hooks" | "script" | "shortScript" | "photo" | "cover"
  | `pkg.${Platform}.caption` | `pkg.${Platform}.hashtags` | `pkg.${Platform}.cta`
  | `pkg.${Platform}.onScreenText` | `pkg.${Platform}.coverHeadline` | `pkg.${Platform}.audio`;

export interface Project {
  id: string;
  brandId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  stage: "media" | "setup" | "analyzing" | "ready" | "approved";
  mediaIds: string[];
  platforms: Platform[];
  objective: Objective;
  tone: Tone;
  singlePictureMode?: SinglePictureMode;
  speakingStyle: SpeakingStyle;
  idea: string; // user's own description / context
  facts: string; // user-confirmed facts (answers to clarifying questions)
  speakingRateWpm: number;
  understanding?: MediaUnderstanding;
  plan?: ContentPlan;
  review?: ReadinessReview;
  /** Sections the user edited or approved. Regeneration never overwrites them. */
  locked: Partial<Record<SectionKey, "edited" | "approved">>;
  seriesId?: string;
  seriesPart?: number;
  jobs?: { id: string; kind: string; status: "running" | "failed" | "done"; message: string; at: string }[];
}

export interface Version {
  id: string;
  projectId: string;
  createdAt: string;
  label: string;
  plan: ContentPlan;
  locked: Project["locked"];
}

export interface UsageRecord {
  id: string;
  at: string;
  kind: "analyze" | "generate" | "rewrite";
  provider: string;
  ok: boolean;
  note: string;
}
