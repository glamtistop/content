import type { BrandProfile } from "./types";

export interface Idea { title: string; audience: string; goal: string; format: string; duration: number; hook: string; media: string; why: string; cta: string }

/** Evergreen, brand-derived ideas — labeled "General guidance" in the UI (no trend data behind them). */
export function ideasFor(brand: BrandProfile): Idea[] {
  const has = (re: RegExp) => brand.products.some((p) => re.test(p));
  const out: Idea[] = [];
  if (has(/keychain/i)) out.push({ title: "Personalized keychain transformation", audience: "Gift shoppers", goal: "Custom orders", format: "Reel / TikTok", duration: 15, hook: "From a photo on my phone to this.", media: "The customer photo (with permission) + finished keychain", why: "Before → after shows the product's value in seconds.", cta: "Request a Custom Quote" });
  if (has(/NFC/i)) out.push({ title: "Making an NFC business stand", audience: "Small businesses", goal: "Bulk buyers", format: "Reel / TikTok", duration: 25, hook: "Your customers can pay you with one tap.", media: "Stand being printed + a phone tapping it", why: "Shows a practical business use, which attracts higher-value orders.", cta: "Ask About Bulk Pricing" });
  if (has(/wedding|event/i)) out.push({ title: "Custom wedding favor showcase", audience: "Couples and planners", goal: "Custom orders", format: "Carousel or Reel", duration: 15, hook: "Favors your guests will actually keep.", media: "A set of finished favors styled on a table", why: "Event buyers order in quantity and plan weeks ahead.", cta: "Request a Custom Quote" });
  out.push({ title: "Packing a customer order", audience: "Existing followers and shoppers", goal: "Engagement", format: "TikTok", duration: 20, hook: "Pack this order with me.", media: "Packing footage, finished products", why: "Behind-the-scenes builds trust that real orders ship.", cta: "Order at PrintQueen3D.com" });
  out.push({ title: "Satisfying printing timelapse", audience: "Broad", goal: "Views", format: "Reel / TikTok", duration: 12, hook: "Watch this come to life.", media: "A timelapse from your printer", why: "Process footage holds attention; good for reach.", cta: "Follow for Part 2" });
  out.push({ title: "Answering a customer's question", audience: "People considering ordering", goal: "Leads", format: "Talking to camera", duration: 30, hook: "Someone asked me how long custom orders take.", media: "You on camera + a finished piece", why: "Removes a common buying objection.", cta: "DM for Details" });
  out.push({ title: "Holiday gift inspiration", audience: "Gift shoppers", goal: "Custom orders", format: "Carousel", duration: 0, hook: "Gift ideas for the person who has everything.", media: "3–5 photos of different personalized pieces", why: "Seasonal timing — save-worthy for planners.", cta: "Shop Personalized Gifts" });
  return out;
}
