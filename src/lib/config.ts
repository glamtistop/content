// Public build-time config. Only the Supabase URL and anon key are public by design;
// every secret (AI keys) lives in Supabase Edge Function secrets, never in this bundle.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
// The publishable key (sb_publishable_…) replaces the legacy anon key; either works here.
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
export const CLOUD_ENABLED = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

/**
 * Upload limits. Supabase's Free plan rejects files over 50 MB, so account mode defaults to 50 MB.
 * After upgrading Supabase, set NEXT_PUBLIC_MAX_UPLOAD_MB (e.g. 500) and redeploy.
 */
export function uploadLimits(cloud: boolean, maxMbSetting?: string) {
  const parsed = Number(maxMbSetting);
  const maxMb = Number.isFinite(parsed) && parsed > 0 ? parsed : cloud ? 50 : 500;
  return {
    maxMb,
    imageBytes: Math.min(30, maxMb) * 1024 ** 2,
    videoBytes: maxMb * 1024 ** 2,
    /** True when the cap comes from the storage plan rather than the app. */
    planCapped: cloud && maxMb <= 50,
  };
}

const UL = uploadLimits(CLOUD_ENABLED, process.env.NEXT_PUBLIC_MAX_UPLOAD_MB);

export const LIMITS = {
  imageBytes: UL.imageBytes,
  videoBytes: UL.videoBytes,
  planCapped: UL.planCapped,
  filesPerProject: 20,
  /** Videos up to this size are sent whole to the AI for audio transcription (Gemini only). */
  inlineVideoForTranscriptBytes: 15 * 1024 ** 2,
};
