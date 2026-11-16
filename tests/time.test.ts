import { describe, expect, it } from "vitest";
import { fmtInTz, isDst, offsetMinutes, postingWindows, postRightNow, zonedToUtc } from "@/lib/time";

const LA = "America/Los_Angeles";

describe("Los Angeles time and daylight saving", () => {
  it("knows PST vs PDT offsets", () => {
    expect(offsetMinutes(new Date("2026-01-15T20:00:00Z"), LA)).toBe(-480);
    expect(offsetMinutes(new Date("2026-07-15T20:00:00Z"), LA)).toBe(-420);
    expect(isDst(new Date("2026-07-15T20:00:00Z"), LA)).toBe(true);
    expect(isDst(new Date("2026-11-14T20:00:00Z"), LA)).toBe(false);
  });

  it("converts wall-clock times on both sides of the Nov 1 2026 fall-back", () => {
    // Oct 31, 7pm PDT = Nov 1 02:00Z ; Nov 2, 7pm PST = Nov 3 03:00Z
    expect(zonedToUtc(2026, 10, 31, 19, 0, LA).toISOString()).toBe("2026-11-01T02:00:00.000Z");
    expect(zonedToUtc(2026, 11, 2, 19, 0, LA).toISOString()).toBe("2026-11-03T03:00:00.000Z");
  });

  it("rolls a nonexistent spring-forward time forward (Mar 8 2026 2:30am)", () => {
    const d = zonedToUtc(2026, 3, 8, 2, 30, LA);
    expect(fmtInTz(d, LA)).toMatch(/3:30\s?AM PDT/);
  });

  it("formats with the correct abbreviation", () => {
    expect(fmtInTz(new Date("2026-11-14T23:51:00Z"), LA)).toMatch(/Sat, Nov 14, 3:51\s?PM PST/);
  });
});

describe("posting windows", () => {
  const ctx = { creatorTz: LA, audienceTzs: [LA, "America/New_York"], objective: "custom_orders" as const };

  it("returns best, second and test windows in the future with exact dates", () => {
    const now = new Date("2026-11-14T23:51:00Z"); // Sat 3:51pm PST
    for (const p of ["tiktok", "instagram", "facebook"] as const) {
      const w = postingWindows(p, ctx, now);
      expect(w.map((x) => x.rank)).toEqual(["best", "second", "test"]);
      for (const x of w) {
        expect(new Date(x.startISO).getTime()).toBeGreaterThan(now.getTime());
        expect(x.label).toMatch(/PST/);
        expect(x.evidence).toBe("general");
        expect(x.confidence).toBe("low");
        expect(x.dataNote).toMatch(/starting hypothesis/);
      }
    }
  });

  it("TikTok best window from Saturday is Monday 7pm Pacific", () => {
    const w = postingWindows("tiktok", ctx, new Date("2026-11-14T23:51:00Z"));
    expect(w[0].label).toMatch(/Mon, Nov 16, 7:00\s?PM PST/);
    expect(w[0].why).toMatch(/10:00\s?PM EST/); // second audience
  });

  it("windows across the DST change carry the right abbreviation", () => {
    const w = postingWindows("tiktok", ctx, new Date("2026-10-30T20:00:00Z")); // Fri Oct 30 PDT
    expect(w[0].label).toMatch(/Mon, Nov 2, 7:00\s?PM PST/);
  });

  it("post right now explains the tradeoff and never guarantees", () => {
    const late = postRightNow("instagram", ctx, new Date("2026-11-15T09:30:00Z")); // 1:30am PST
    expect(late.reasonable).toBe(false);
    expect(late.headline).toMatch(/late night/);
    const inWindow = postRightNow("tiktok", ctx, new Date("2026-11-17T03:10:00Z")); // Mon 7:10pm PST
    expect(inWindow.reasonable).toBe(true);
    expect(inWindow.explanation).toMatch(/guarantee/);
  });
});

import { uploadLimits } from "@/lib/config";
describe("upload limits", () => {
  it("caps account mode at the Supabase Free plan's 50 MB unless raised", () => {
    expect(uploadLimits(true).videoBytes).toBe(50 * 1024 ** 2);
    expect(uploadLimits(true).planCapped).toBe(true);
    expect(uploadLimits(true, "500").videoBytes).toBe(500 * 1024 ** 2);
    expect(uploadLimits(true, "500").planCapped).toBe(false);
    expect(uploadLimits(false).videoBytes).toBe(500 * 1024 ** 2);
    expect(uploadLimits(true).imageBytes).toBe(30 * 1024 ** 2);
    expect(uploadLimits(true, "nonsense").maxMb).toBe(50);
  });
});
