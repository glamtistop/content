import type { Objective, Platform, PostingWindow } from "./types";

// ---------- timezone primitives (DST-safe, built on Intl) ----------

interface ZParts { year: number; month: number; day: number; hour: number; minute: number; second: number; weekday: number }
const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function partsInTz(d: Date, tz: string): ZParts {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", weekday: "short",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const o: Record<string, string> = {};
  for (const p of f.formatToParts(d)) o[p.type] = p.value;
  return {
    year: +o.year, month: +o.month, day: +o.day,
    hour: +o.hour % 24, minute: +o.minute, second: +o.second, weekday: WD[o.weekday],
  };
}

/** Minutes east of UTC for `tz` at instant `d` (e.g. -480 for PST, -420 for PDT). */
export function offsetMinutes(d: Date, tz: string): number {
  const p = partsInTz(d, tz);
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUTC - Math.floor(d.getTime() / 1000) * 1000) / 60000);
}

/** The instant when the wall clock in `tz` reads y-m-d h:mi. Nonexistent (spring-forward) times roll forward. */
export function zonedToUtc(y: number, m: number, d: number, h: number, mi: number, tz: string): Date {
  const guess = Date.UTC(y, m - 1, d, h, mi);
  const off1 = offsetMinutes(new Date(guess), tz);
  const off2 = offsetMinutes(new Date(guess - off1 * 60000), tz);
  const candidates = [...new Set([guess - off1 * 60000, guess - off2 * 60000])].sort((a, b) => a - b);
  const exact = candidates.filter((t) => {
    const p = partsInTz(new Date(t), tz);
    return p.hour === h && p.minute === mi && p.day === d;
  });
  // Ambiguous (fall-back) times take the first occurrence; nonexistent (spring-forward) times roll forward.
  return new Date(exact.length ? exact[0] : candidates[candidates.length - 1]);
}

export function fmtInTz(d: Date, tz: string, opts: { date?: boolean; seconds?: boolean } = { date: true }) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    ...(opts.date !== false ? { weekday: "short", month: "short", day: "numeric" } : {}),
    hour: "numeric", minute: "2-digit", ...(opts.seconds ? { second: "2-digit" } : {}),
    timeZoneName: "short",
  }).format(d);
}

export function tzAbbrev(d: Date, tz: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" })
    .formatToParts(d).find((p) => p.type === "timeZoneName")?.value ?? tz;
}

export function isDst(d: Date, tz: string) {
  const y = partsInTz(d, tz).year;
  const jan = offsetMinutes(new Date(Date.UTC(y, 0, 1)), tz);
  const jul = offsetMinutes(new Date(Date.UTC(y, 6, 1)), tz);
  return offsetMinutes(d, tz) > Math.min(jan, jul) && jan !== jul;
}

export const COMMON_TZS = [
  "America/Los_Angeles", "America/Denver", "America/Phoenix", "America/Chicago", "America/New_York",
  "America/Anchorage", "Pacific/Honolulu", "America/Toronto", "America/Mexico_City", "Europe/London", "Europe/Paris", "Asia/Tokyo", "Australia/Sydney",
];

// ---------- posting-time hypotheses ----------

interface Slot { days: number[]; hour: number; minute: number; why: string }
type SlotSet = { best: Slot; second: Slot; test: Slot };

/**
 * Starting hypotheses only. These come from widely published general guidance about when
 * people browse each app — NOT from this account's data and NOT from any platform algorithm.
 * They are meant to be tested, then replaced by account-specific results in Phase 2.
 */
const CONSUMER: Record<Platform, SlotSet> = {
  tiktok: {
    best: { days: [1, 2, 3, 4], hour: 19, minute: 0, why: "Weekday evenings are a common leisure-scrolling window for consumer audiences." },
    second: { days: [1, 2, 3, 4, 5], hour: 12, minute: 0, why: "Lunch breaks are a second common browsing window." },
    test: { days: [6], hour: 10, minute: 0, why: "Weekend mornings are worth testing for gift and event shoppers planning ahead." },
  },
  instagram: {
    best: { days: [1, 2, 3, 4, 5], hour: 12, minute: 0, why: "Midday weekdays are a commonly cited window for feed and Reels browsing." },
    second: { days: [1, 2, 3, 4], hour: 19, minute: 30, why: "Early evening catches people after work." },
    test: { days: [0], hour: 10, minute: 0, why: "Sunday mornings are worth testing for gift inspiration content." },
  },
  facebook: {
    best: { days: [1, 2, 3, 4, 5], hour: 9, minute: 0, why: "Weekday mornings are a commonly cited Facebook Page window." },
    second: { days: [1, 2, 3, 4, 5], hour: 13, minute: 0, why: "Early afternoon is a second commonly cited window." },
    test: { days: [6], hour: 11, minute: 0, why: "Saturday late morning is worth testing for local event and party planners." },
  },
};
const BUSINESS: Partial<Record<Platform, Partial<SlotSet>>> = {
  facebook: { best: { days: [2, 3, 4], hour: 10, minute: 0, why: "Small-business buyers tend to browse during weekday working hours (Tue–Thu)." } },
  instagram: { best: { days: [2, 3, 4], hour: 11, minute: 0, why: "Business buyers often check Instagram late morning on weekdays." } },
  tiktok: { second: { days: [2, 3, 4], hour: 11, minute: 30, why: "Testing a weekday late-morning slot for business buyers." } },
};
const B2B_GOALS: Objective[] = ["bulk_buyers", "leads", "bookings"];

export function slotsFor(platform: Platform, objective: Objective): SlotSet {
  const base = CONSUMER[platform];
  return B2B_GOALS.includes(objective) ? { ...base, ...(BUSINESS[platform] ?? {}) } : base;
}

function nextOccurrence(slot: Slot, tz: string, from: Date, leadMin = 15): Date {
  const start = partsInTz(from, tz);
  for (let i = 0; i < 15; i++) {
    const day = new Date(Date.UTC(start.year, start.month - 1, start.day + i));
    const wd = day.getUTCDay();
    if (!slot.days.includes(wd)) continue;
    const inst = zonedToUtc(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), slot.hour, slot.minute, tz);
    if (inst.getTime() > from.getTime() + leadMin * 60000) return inst;
  }
  throw new Error("No upcoming slot found");
}

export interface PostingContext {
  creatorTz: string;
  audienceTzs: string[];
  objective: Objective;
  connectedPosts?: number; // historical posts available for this platform (Phase 2)
}

export function postingWindows(platform: Platform, ctx: PostingContext, now = new Date()): PostingWindow[] {
  const audienceTz = ctx.audienceTzs[0] || ctx.creatorTz;
  const set = slotsFor(platform, ctx.objective);
  const n = ctx.connectedPosts ?? 0;
  const dataNote = n === 0
    ? "No account data connected — this is a starting hypothesis to test."
    : `Based on ${n} past posts — small samples are noisy.`;
  return (["best", "second", "test"] as const).map((rank) => {
    const slot = set[rank];
    const inst = nextOccurrence(slot, audienceTz, now);
    const others = ctx.audienceTzs.slice(1).filter((t) => t !== audienceTz)
      .map((t) => `${fmtInTz(inst, t, { date: false })}`).join(", ");
    const audienceNote = audienceTz !== ctx.creatorTz
      ? ` Timed for your main audience (${fmtInTz(inst, audienceTz, { date: false })}).`
      : "";
    return {
      rank,
      startISO: inst.toISOString(),
      label: fmtInTz(inst, ctx.creatorTz),
      timezone: ctx.creatorTz,
      why: slot.why + audienceNote + (others ? ` That's ${others} for your other audience.` : ""),
      evidence: n === 0 ? "general" : "inferred",
      confidence: n >= 30 ? "medium" : "low",
      dataNote,
    } satisfies PostingWindow;
  });
}

export interface PostNowAdvice {
  nowLabel: string;
  reasonable: boolean;
  headline: string;
  explanation: string;
  next: PostingWindow;
  hoursUntilNext: number;
}

export function postRightNow(platform: Platform, ctx: PostingContext, now = new Date()): PostNowAdvice {
  const audienceTz = ctx.audienceTzs[0] || ctx.creatorTz;
  const a = partsInTz(now, audienceTz);
  const windows = postingWindows(platform, ctx, now);
  const next = windows.slice().sort((x, y) => x.startISO.localeCompare(y.startISO))[0];
  const hoursUntilNext = (new Date(next.startISO).getTime() - now.getTime()) / 3600000;
  const set = slotsFor(platform, ctx.objective);
  const nearSlot = (Object.values(set) as Slot[]).some((s) => {
    if (!s.days.includes(a.weekday)) return false;
    const diff = a.hour * 60 + a.minute - (s.hour * 60 + s.minute);
    return diff >= -45 && diff <= 90;
  });
  const lateNight = a.hour < 6 || a.hour >= 23;
  let reasonable: boolean, headline: string, explanation: string;
  if (nearSlot) {
    reasonable = true;
    headline = "Now is a reasonable time to post.";
    explanation = "You're inside one of the starting windows for this platform. Posting now is a fair test.";
  } else if (lateNight) {
    reasonable = false;
    headline = "It's late night for your audience.";
    explanation = `It's ${fmtInTz(now, audienceTz, { date: false })} where most of your audience is. Fewer people are likely browsing; the next window is in about ${Math.round(hoursUntilNext)} hours.`;
  } else {
    reasonable = hoursUntilNext > 4;
    headline = hoursUntilNext <= 4 ? "A starting window is coming up soon." : "Posting now is fine — there's no strong reason to wait.";
    explanation = hoursUntilNext <= 4
      ? `The next window starts in about ${Math.max(1, Math.round(hoursUntilNext))} hour(s). Waiting is a small cost if the post is ready to schedule.`
      : "The next window is several hours away. Getting the post out consistently usually matters more than an untested time slot.";
  }
  explanation += " None of these times guarantee reach — they're hypotheses until your own results come in.";
  return { nowLabel: fmtInTz(now, ctx.creatorTz, { date: true, seconds: false }), reasonable, headline, explanation, next, hoursUntilNext };
}
