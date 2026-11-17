import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { generateTemplatePlan } from "@/lib/generate/template";
import { applyMemory, diffPlans, learnRules, learningMetric, norm } from "@/lib/memory";
import { localStore } from "@/lib/store/local";
import type { DecisionEvent, PreferenceRule } from "@/lib/types";
import { PLATFORMS } from "@/lib/types";
import { deepClone } from "@/lib/util";
import { brand, image, project, video } from "./fixtures";

const NOW = new Date("2026-11-16T12:00:00Z");
let n = 0;
function ev(over: Partial<DecisionEvent>): DecisionEvent {
  n++;
  return {
    id: `e${n}`, brandId: "b1", projectId: `p${n % 3}`, at: "2026-11-10T12:00:00Z", agent: "writer",
    kind: "edit", field: "caption", platform: "instagram", before: "", after: "", reasons: [], context: {}, ...over,
  };
}
const learn = (events: DecisionEvent[], existing: PreferenceRule[] = []) => learnRules(events, existing, "b1", NOW).rules;
const find = (rules: PreferenceRule[], kind: string) => rules.find((r) => r.kind === kind);

describe("capturing decisions", () => {
  it("turns plan changes into field-level edits and cuts", () => {
    const a = generateTemplatePlan({ brand: brand(), project: project(), assets: [video()], seed: 1 });
    const b = deepClone(a);
    b.packages.instagram.caption = "My own caption.";
    b.segments.splice(1, 1);
    b.packages.tiktok.hashtags = b.packages.tiktok.hashtags.slice(1);
    const d = diffPlans(a, b, PLATFORMS);
    expect(d.find((x) => x.field === "caption" && x.platform === "instagram")?.after).toBe("My own caption.");
    expect(d.filter((x) => x.kind === "cut" && x.field === "spoken")).toHaveLength(1);
    expect(d.find((x) => x.field === "hashtags" && x.platform === "tiktok")).toBeDefined();
    expect(diffPlans(a, deepClone(a), PLATFORMS)).toEqual([]);
  });
});

describe("learning rules", () => {
  const emojiEdit = () => ev({ before: "So happy with this one ✨ Made to order 💛", after: "So happy with this one. Made to order." });

  it("needs 3 consistent decisions before a pattern becomes active", () => {
    expect(find(learn([emojiEdit(), emojiEdit()]), "emoji")?.status).toBe("suggested");
    const r = find(learn([emojiEdit(), emojiEdit(), emojiEdit()]), "emoji")!;
    expect(r.status).toBe("active");
    expect(r.text).toBe("No emojis in Instagram captions");
    expect(r.events).toBe(3);
  });

  it("counter-evidence keeps a pattern from activating", () => {
    const add = () => ev({ before: "Made to order.", after: "Made to order 💛✨" });
    expect(find(learn([emojiEdit(), emojiEdit(), emojiEdit(), add(), add()]), "emoji")?.status).toBe("suggested");
  });

  it("old decisions fade (half-life 90 days)", () => {
    const old = () => ({ ...emojiEdit(), at: "2025-06-01T00:00:00Z" });
    const r = find(learn([old(), old(), old()]), "emoji")!;
    expect(r.evidence).toBeLessThan(1);
    expect(r.status).toBe("suggested");
  });

  it("a rejected hook is avoided immediately; repeated openers become a rule", () => {
    const rules = learn([
      ev({ kind: "reject", field: "hook", platform: undefined, before: "Stop scrolling — look at this detail.", context: { style: "Curiosity" } }),
      ev({ kind: "regenerate", field: "hook", platform: undefined, before: "Stop scrolling, this is custom." }),
    ]);
    expect(rules.find((r) => r.kind === "rejected_hook")?.status).toBe("active");
    expect(rules.find((r) => r.key === "opener|stop scrolling look")?.status).toBe("suggested"); // one rejection of this exact opener
    const opener = learn([
      ev({ kind: "reject", field: "hook", before: "Stop scrolling right now." }),
      ev({ kind: "regenerate", field: "hook", before: "Stop scrolling right here." }),
    ]).find((r) => r.key === "opener|stop scrolling right");
    expect(opener?.status).toBe("active");
  });

  it("learns phrases removed across projects, hashtags and CTAs", () => {
    const rules = learn([
      ev({ projectId: "a", before: "This is a game changer for gifts. DM me.", after: "Perfect for gifts. DM me." }),
      ev({ projectId: "b", before: "Total game changer. Order today.", after: "Order today." }),
      ev({ projectId: "c", before: "A real game changer here. Link in bio.", after: "Link in bio." }),
      ev({ projectId: "a", field: "hashtags", before: "#smallbusiness #printqueen3d", after: "#printqueen3d #losangeles" }),
      ev({ projectId: "b", field: "hashtags", before: "#smallbusiness #printqueen3d", after: "#printqueen3d #losangeles" }),
      ev({ field: "cta", before: "Shop Personalized Gifts", after: "DM for Details" }),
      ev({ field: "cta", before: "Order at PrintQueen3D.com", after: "DM for Details" }),
    ]);
    expect(rules.find((r) => r.key === "avoid_phrase|game changer")?.status).toBe("active");
    expect(rules.find((r) => r.key === "avoid_tag|#smallbusiness")?.status).toBe("active");
    expect(rules.find((r) => r.key === "prefer_tag|#losangeles")?.status).toBe("active");
    expect(rules.find((r) => r.kind === "cta")?.status).toBe("active");
  });

  it("never overrides a rule the user switched off or reworded", () => {
    const first = learn([emojiEdit(), emojiEdit(), emojiEdit()]);
    const userOff = first.map((r) => (r.kind === "emoji" ? { ...r, status: "disabled" as const, userSet: true, text: "Emojis are fine sometimes" } : r));
    const again = learn([emojiEdit(), emojiEdit(), emojiEdit(), emojiEdit()], userOff);
    const r = find(again, "emoji")!;
    expect(r.status).toBe("disabled");
    expect(r.text).toBe("Emojis are fine sometimes");
    expect(r.id).toBe(userOff.find((x) => x.kind === "emoji")!.id);
  });

  it("only stores reasons the user picked", () => {
    const rules = learn([ev({ kind: "regenerate", field: "hook", before: "x y z", reasons: ["too_long"] }), ev({ kind: "regenerate", field: "all", before: "a", reasons: ["too_long"] })]);
    expect(rules.find((r) => r.key === "length|reason|*|*")?.status).toBe("active");
    expect(learn([ev({ kind: "regenerate", field: "hook", before: "x y z" })]).some((r) => r.kind === "tone")).toBe(false);
  });
});

describe("applying memory to new drafts", () => {
  it("the template writer never returns a rejected hook", () => {
    const base = generateTemplatePlan({ brand: brand(), project: project(), assets: [video()], seed: 3 });
    const rejected = base.hooks[1].text;
    const rules = learn([ev({ kind: "reject", field: "hook", before: rejected })]);
    for (let seed = 1; seed < 40; seed++) {
      const p = generateTemplatePlan({ brand: brand(), project: project(), assets: [video()], seed, memory: rules });
      expect(p.hooks.map((h) => norm(h.text))).not.toContain(norm(rejected));
      expect(p.hooks).toHaveLength(3);
    }
  });

  it("strips emojis, drops avoided phrases, fixes hashtags and reports what it applied", () => {
    const rules = learn([
      ev({ before: "So happy ✨ with this", after: "So happy with this" }), ev({ before: "Love it 💛 truly", after: "Love it truly" }), ev({ before: "Yes ✨ indeed", after: "Yes indeed" }),
      ev({ projectId: "a", field: "hashtags", before: "#smallbusiness #x", after: "#x" }), ev({ projectId: "b", field: "hashtags", before: "#smallbusiness #y", after: "#y" }),
    ]);
    const plan = generateTemplatePlan({ brand: brand(), project: project(), assets: [video()], seed: 5 });
    plan.packages.instagram.caption = "Made to order ✨\n\nIdeal for gifts.";
    const { plan: out, applied } = applyMemory(plan, rules, PLATFORMS);
    expect(out.packages.instagram.caption).not.toMatch(/✨/);
    expect(out.packages.tiktok.hashtags.map((h) => h.tag)).not.toContain("#smallbusiness");
    expect(applied).toContain("No emojis in Instagram captions");
    expect(out.memoryApplied).toEqual(applied);
    expect(applyMemory(plan, [], PLATFORMS).applied).toEqual([]);
  });

  it("a learned 'too long' shortens the script target", () => {
    const rules = learn([ev({ kind: "regenerate", field: "all", reasons: ["too_long"] }), ev({ kind: "regenerate", field: "all", reasons: ["too_long"] })]);
    const plan = generateTemplatePlan({ brand: brand(), project: project(), assets: [video()], seed: 6 });
    const out = applyMemory(plan, rules, PLATFORMS).plan;
    expect(out.targetDurationSec).toBeLessThan(plan.targetDurationSec);
  });

  it("uses the preferred CTA in new drafts", () => {
    const rules = learn([ev({ field: "cta", after: "DM for Details" }), ev({ field: "cta", after: "DM for Details" })]);
    const p = generateTemplatePlan({ brand: brand(), project: project({ objective: "website" }), assets: [image()], seed: 2, memory: rules });
    expect(p.packages.facebook.cta).toBe("DM for Details");
  });
});

describe("memory storage and metric", () => {
  it("stores, lists and forgets per brand", async () => {
    const s = localStore("t-memory");
    await s.saveDecision(ev({ brandId: "b1" }));
    await s.saveDecision(ev({ brandId: "b2" }));
    const rules = learn([ev({ kind: "reject", field: "hook", before: "Nope." })]);
    await s.saveRules(rules);
    expect(await s.listDecisions("b1")).toHaveLength(1);
    expect(await s.listRules("b1")).toHaveLength(rules.length);
    await s.clearMemory("b1");
    expect(await s.listDecisions("b1")).toHaveLength(0);
    expect(await s.listRules("b1")).toHaveLength(0);
    expect(await s.listDecisions("b2")).toHaveLength(1);
  });

  it("reports whether drafts need fewer changes over time", () => {
    const heavy = () => ev({ before: "one two three four five six", after: "seven eight nine ten" });
    const light = () => ev({ before: "one two three four five six", after: "one two three four five seven" });
    const m = learningMetric([heavy(), heavy(), heavy(), light(), light(), light()])!;
    expect(m.recent).toBeLessThan(m.earlier);
    expect(learningMetric([heavy()])).toBeNull();
  });
});
