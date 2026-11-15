import { CLOUD_ENABLED } from "./config";

export type FeatureStatus = "Working" | "Requires Credentials" | "Requires Platform Approval" | "Fallback Available" | "Planned / Not Implemented";

export interface Feature { name: string; status: FeatureStatus; note: string; phase: 1 | 2 | 3 }

export function featureList(aiConnected: boolean): Feature[] {
  return [
    { name: "Dashboard, projects, autosave, version history", status: "Working", note: CLOUD_ENABLED ? "Saved to your Supabase account." : "Saved in this browser (this-device mode).", phase: 1 },
    { name: "Sign-in with your own email and password", status: CLOUD_ENABLED ? "Working" : "Requires Credentials", note: CLOUD_ENABLED ? "Supabase Auth." : "Add Supabase keys to enable accounts and sync.", phase: 1 },
    { name: "Brand profiles (multiple brands)", status: "Working", note: "Each brand keeps its own projects and media.", phase: 1 },
    { name: "Photo and video uploads (JPG, PNG, WEBP, HEIC, MP4, MOV)", status: "Working", note: "Validated by file signature; HEIC converted to JPEG.", phase: 1 },
    { name: "Technical media analysis", status: "Working", note: "Focus, light, orientation, length, and frames sampled at real timestamps.", phase: 1 },
    { name: "AI media understanding (objects, products, on-screen text, speech)", status: aiConnected ? "Working" : "Fallback Available", note: aiConnected ? "Runs on your server with your AI key." : "Needs Supabase + an AI key. Falls back to technical checks + your description.", phase: 1 },
    { name: "Scripts, hooks, captions, platform packages", status: aiConnected ? "Working" : "Fallback Available", note: aiConnected ? "AI-written, validated before use." : "Template writer produces complete copy from your description.", phase: 1 },
    { name: "Speaking-time estimator and auto-shortening", status: "Working", note: "Words, pauses, demos, transitions and end card.", phase: 1 },
    { name: "Creative Readiness Score", status: "Working", note: "Transparent checklist — not a virality prediction.", phase: 1 },
    { name: "Teleprompter and voice recording", status: "Working", note: "Recording downloads to your device.", phase: 1 },
    { name: "Exports: plan (.md), packages (.txt), shot list (.csv), subtitles (.srt/.vtt), alt text, cover PNG", status: "Working", note: "Subtitle timing is estimated from the script.", phase: 1 },
    { name: "Best time to post (starting hypotheses) and Post Right Now", status: "Working", note: "General guidance until account data is connected.", phase: 1 },
    { name: "Verified trend research", status: "Requires Credentials", note: "Needs an approved trend data source. You can open TikTok Creative Center yourself meanwhile.", phase: 2 },
    { name: "Music research with licensing checks", status: "Requires Platform Approval", note: "Commercial music libraries aren't available through a public API. Guidance only for now.", phase: 2 },
    { name: "Connected account analytics and performance learning", status: "Requires Platform Approval", note: "TikTok and Meta app review required.", phase: 2 },
    { name: "Photo-to-video and MP4 rendering", status: "Planned / Not Implemented", note: "Storyboards are labeled as storyboards until rendering ships.", phase: 3 },
    { name: "Content calendar and scheduling", status: "Planned / Not Implemented", note: "Phase 3.", phase: 3 },
    { name: "Direct publishing to TikTok, Instagram, Facebook", status: "Requires Platform Approval", note: "Official APIs only, with your explicit approval per post.", phase: 3 },
    { name: "Leads, orders and revenue tracking", status: "Planned / Not Implemented", note: "Phase 3 (manual entry first).", phase: 3 },
  ];
}
