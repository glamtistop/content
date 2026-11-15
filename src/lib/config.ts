// Public build-time config. Only the Supabase URL and anon key are public by design;
// every secret (AI keys) lives in Supabase Edge Function secrets, never in this bundle.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
// The publishable key (sb_publishable_…) replaces the legacy anon key; either works here.
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
export const CLOUD_ENABLED = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

export const LIMITS = {
  imageBytes: 30 * 1024 ** 2,
  videoBytes: 500 * 1024 ** 2,
  filesPerProject: 20,
  /** Videos up to this size are sent whole to the AI for audio transcription (Gemini only). */
  inlineVideoForTranscriptBytes: 15 * 1024 ** 2,
};
