import { describe, expect, it } from "vitest";
import { estimateDuration, fitToDuration, wordCount } from "@/lib/duration";
import { coercePlan, groundTimestamp } from "@/lib/generate/ai";
import { findUnsupportedClaims, improvePlan, reviewPlan } from "@/lib/generate/review";
import { mergeRespectingLocks, replaceOneSection, setSection } from "@/lib/generate/sections";
import { generateTemplatePlan } from "@/lib/generate/template";
import { RULES } from "@/lib/platforms";
import { PLATFORMS } from "@/lib/types";
import { brand, image, project, video } from "./fixtures";

describe("speaking duration", () => {
  it("counts words and estimates time at the given rate", () => {
    expect(wordCount("I just made one of the biggest investments in my small business!")).toBe(12);
    const seg = [{ id: "1", label: "a", spoken: "word ".repeat(150).trim(), onScreen: "x", visual: "", direction: "", demoSec: 0 }];
    const e = estimateDuration(seg, 150, { endCard: false });
    expect(e.breakdown.speaking).toBeCloseTo(60, 0);
    expect(estimateDuration(seg, 300, { endCard: false }).breakdown.speaking).toBeCloseTo(30, 0);
  });

  it("adds pauses, demos, transitions and the end card", () => {
    const seg = [
      { id: "1", label: "Hook", spoken: "Look at this... (pause 2s) wow.", onScreen: "", visual: "", direction: "", demoSec: 0 },
      { id: "2", label: "Demo", spoken: "", onScreen: "Watch", visual: "", direction: "", demoSec: 4 },
    ];
    const e = estimateDuration(seg, 150);
    expect(e.breakdown.pauses).toBeGreaterThanOrEqual(2.5);
    expect(e.breakdown.demos).toBe(4);
    expect(e.breakdown.transitions).toBeCloseTo(0.3);
    expect(e.breakdown.endCard).toBe(1.5);
  });

  it("shortens to fit while keeping hook and CTA", () => {
    const long = "This is a sentence about the product. ".repeat(12);
    const segs = [
      { id: "h", label: "Hook", spoken: "Hook line here.", onScreen: "", visual: "", direction: "", demoSec: 0 },
      { id: "m", label: "Mid", spoken: long, onScreen: "", visual: "", direction: "", demoSec: 3 },
      { id: "c", label: "CTA", spoken: "DM me for details.", onScreen: "", visual: "", direction: "", demoSec: 0 },
    ];
    const out = fitToDuration(segs, 12);
    expect(estimateDuration(out).totalSec).toBeLessThanOrEqual(12.25);
    expect(out[0].spoken).toBe("Hook line here.");
    expect(out[out.length - 1].spoken).toBe("DM me for details.");
    expect(segs[1].spoken).toBe(long); // input untouched
  });
});

describe("template content engine", () => {
  const b = brand();

  it("single photo → complete still-image package", () => {
    const plan = generateTemplatePlan({ brand: b, project: project({ singlePictureMode: "photo" }), assets: [image()], seed: 1 });
    expect(plan.photo).toBeDefined();
    expect(plan.photo!.captions).toHaveLength(3);
    expect(plan.photo!.headline).toBeTruthy();
    expect(plan.photo!.altText).toBeTruthy();
    for (const p of PLATFORMS) {
      const pkg = plan.packages[p];
      expect(pkg.caption.length).toBeGreaterThan(20);
      expect(pkg.hashtags.length).toBeGreaterThan(0);
      expect(pkg.hashtags.length).toBeLessThanOrEqual(RULES[p].hashtagMax);
      expect(pkg.hashtags.every((h) => h.evidence === "inferred")).toBe(true);
      expect(pkg.postingWindows).toHaveLength(3);
      expect(pkg.script).toBe(""); // photo stays a photo
    }
  });

  it("video → word-for-word script with spoken lines, separate on-screen text, fits target", () => {
    const plan = generateTemplatePlan({ brand: b, project: project(), assets: [video()], seed: 2 });
    expect(plan.hooks).toHaveLength(3);
    expect(plan.segments.length).toBeGreaterThanOrEqual(3);
    expect(plan.segments.every((s) => s.spoken.trim().length > 0)).toBe(true);
    expect(plan.segments[0].onScreen).not.toBe("");
    expect(plan.segments.map((s) => s.spoken).join(" ")).toMatch(/custom photo keychain/i);
    expect(estimateDuration(plan.segments).totalSec).toBeLessThanOrEqual(plan.targetDurationSec + 0.25);
    expect(plan.shortScript.length).toBeGreaterThan(0);
  });

  it("packages are distinct per platform", () => {
    const plan = generateTemplatePlan({ brand: b, project: project(), assets: [video()], seed: 3 });
    const caps = PLATFORMS.map((p) => plan.packages[p].caption);
    expect(new Set(caps).size).toBe(3);
    const tagSets = PLATFORMS.map((p) => plan.packages[p].hashtags.map((h) => h.tag).join(","));
    expect(new Set(tagSets).size).toBe(3);
  });

  it("only references real extracted frame timestamps", () => {
    const v = video();
    const plan = generateTemplatePlan({ brand: b, project: project(), assets: [v], seed: 4 });
    const realTs = v.tech!.frames!.map((f) => f.t);
    for (const s of plan.segments) if (s.sourceRef?.t !== undefined) expect(realTs).toContain(s.sourceRef.t);
    expect(plan.editPlan.join(" ")).toMatch(/soft around 2.6s/);
    expect(plan.editPlan.join(" ")).toMatch(/dark around 26.3s/);
  });

  it("never fabricates prices, offers, reviews or guarantees", () => {
    for (let seed = 1; seed < 30; seed++) {
      const plan = generateTemplatePlan({ brand: b, project: project({ tone: (["confident", "luxury", "funny", "bold", "trend"] as const)[seed % 5] }), assets: [video()], seed });
      const r = reviewPlan(plan, project(), [video()]);
      expect(r.rejected).toEqual([]);
    }
  });
});

describe("editing preserves approved work", () => {
  const b = brand();
  const base = generateTemplatePlan({ brand: b, project: project(), assets: [video()], seed: 10 });

  it("regenerating hooks keeps an edited caption", () => {
    const edited = setSection(base, "pkg.instagram.caption", { caption: "MY OWN CAPTION", shortCaption: "mine" });
    const fresh = generateTemplatePlan({ brand: b, project: project(), assets: [video()], seed: 99 });
    const after = replaceOneSection(edited, fresh, "hooks");
    expect(after.packages.instagram.caption).toBe("MY OWN CAPTION");
    expect(after.hooks).toEqual(fresh.hooks);
    expect(after.segments).toEqual(edited.segments);
  });

  it("full regeneration keeps every locked section", () => {
    const edited = setSection(base, "pkg.tiktok.hashtags", [{ tag: "#mine", purpose: "x", evidence: "inferred" }]);
    const fresh = generateTemplatePlan({ brand: b, project: project(), assets: [video()], seed: 77 });
    const after = mergeRespectingLocks(edited, fresh, { "pkg.tiktok.hashtags": "approved" });
    expect(after.packages.tiktok.hashtags[0].tag).toBe("#mine");
    expect(after.packages.instagram.hashtags).toEqual(fresh.packages.instagram.hashtags);
  });

  it("improve-my-post never touches locked sections", () => {
    const longSegs = base.segments.map((s) => ({ ...s, spoken: s.spoken + " Extra words to make it long. ".repeat(6) }));
    const plan = { ...base, segments: longSegs };
    const res = improvePlan(plan, project({ locked: { script: "edited" } }));
    expect(res.plan.segments).toEqual(longSegs);
    expect(res.skipped.join(" ")).toMatch(/edited/);
    const res2 = improvePlan(plan, project());
    expect(estimateDuration(res2.plan.segments).totalSec).toBeLessThanOrEqual(plan.targetDurationSec + 1);
  });
});

describe("readiness score", () => {
  it("is 0–100 with a readable rubric and flags unsupported claims", () => {
    const plan = generateTemplatePlan({ brand: brand(), project: project(), assets: [video()], seed: 5 });
    const r = reviewPlan(plan, project(), [video()]);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.checks.reduce((s, c) => s + c.max, 0)).toBe(100);
    expect(findUnsupportedClaims("Only 3 left! 20% off, customers love it", "")).toHaveLength(3);
    expect(findUnsupportedClaims("Keychains are $12", "keychains are $12 each")).toHaveLength(0);
  });
});

describe("AI output validation", () => {
  const v = video();
  it("drops timestamps that don't match an extracted frame", () => {
    expect(groundTimestamp([v], 0, 10.4, new Set())?.t).toBe(10.4);
    expect(groundTimestamp([v], 0, 14, new Set())).toBeUndefined();
    expect(groundTimestamp([v], 0, 99, new Set([0]))).toBeUndefined(); // past the end
    expect(groundTimestamp([image()], 0, 1, new Set())).toBeUndefined();
  });

  it("caps hashtags, forces evidence labels, and keeps structure when AI output is partial", () => {
    const base = generateTemplatePlan({ brand: brand(), project: project(), assets: [v], seed: 6 });
    const out = coercePlan({
      hooks: [{ text: "A" }, { text: "B" }],
      packages: { instagram: { hashtags: Array.from({ length: 12 }, (_, i) => ({ tag: `tag${i}`, evidence: "verified" })) } },
      segments: [{ label: "Hook", spoken: "Hi", onScreen: "Hi", assetIndex: 0, t: 14 }],
    }, base, [v]);
    expect(out.hooks).toEqual(base.hooks); // only 2 hooks → ignored
    expect(out.packages.instagram.hashtags).toHaveLength(RULES.instagram.hashtagMax);
    expect(out.packages.instagram.hashtags.every((h) => h.evidence === "inferred" && h.tag.startsWith("#"))).toBe(true);
    expect(out.segments[0].sourceRef).toBeUndefined();
    expect(out.packages.tiktok.postingWindows).toHaveLength(3);
  });
});

describe("activity vs product phrasing", () => {
  it("doesn't treat an activity as a product", () => {
    const plan = generateTemplatePlan({ brand: brand(), project: project({ idea: "unboxing my new xTool UV printer and the first custom keychain" }), assets: [video(), video({ id: "v2", tech: { ...video().tech!, durationSec: 9, orientation: "horizontal", aspect: "16:9" } })], seed: 8 });
    const all = [...plan.hooks.map((h) => h.text), ...plan.segments.map((s) => s.spoken), ...PLATFORMS.map((p) => plan.packages[p].caption + plan.packages[p].coverHeadline)].join(" | ");
    expect(all).not.toMatch(/custom unboxing|a unboxing|made to order\W+unboxing|Unboxing my new xTool UV printer, made to order/i);
    expect(all).toMatch(/Unboxing my new xTool UV printer/);
    expect(plan.segments.length).toBeGreaterThanOrEqual(3);
  });
  it("adds articles for products", () => {
    const plan = generateTemplatePlan({ brand: brand(), project: project({ idea: "custom NFC payment stand for a coffee shop" }), assets: [video()], seed: 9 });
    expect(plan.segments.map((s) => s.spoken).join(" ")).toMatch(/This is a custom NFC payment stand/);
    expect(plan.hooks[1].text).toBe("If you need a custom NFC payment stand, watch this.");
  });
});
