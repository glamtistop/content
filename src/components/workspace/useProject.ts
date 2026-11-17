"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { analyze, generate, type GenOptions } from "@/lib/generate";
import { reviewPlan } from "@/lib/generate/review";
import { generateTemplatePlan } from "@/lib/generate/template";
import { previewFor } from "@/lib/ingest";
import { sectionLabel } from "@/lib/generate/sections";
import { diffPlans, hookAvoider, memoryForPrompt, norm } from "@/lib/memory";
import type { ContentPlan, DecisionEvent, MediaAsset, MemoryField, Platform, Project, ReasonCode, SectionKey, Version } from "@/lib/types";
import { deepClone, nowISO, uid } from "@/lib/util";
import { useApp } from "../AppProvider";
import { useBrandMemory, type NewDecision } from "./useBrandMemory";

export type SaveState = "saved" | "saving" | "error";

/** What a section's text is, for memory (feature 5). */
function sectionMemory(plan: ContentPlan, key: SectionKey): { field: MemoryField; platform?: Platform; text: string } {
  if (key === "hooks") return { field: "hook", text: plan.hooks[plan.recommendedHook.index]?.text ?? "" };
  if (key === "script") return { field: "spoken", text: plan.segments.map((s) => s.spoken).filter(Boolean).join(" ") };
  if (key === "shortScript") return { field: "shortScript", text: plan.shortScript };
  if (key === "photo") return { field: "photoCaption", text: plan.photo?.captions.join("\n") ?? "" };
  if (key === "cover") return { field: "coverHeadline", text: plan.cover.headlines.premium };
  const [, pl, f] = key.split(".") as [string, Platform, string];
  const k = plan.packages[pl];
  const map: Record<string, [MemoryField, string]> = {
    caption: ["caption", k.caption], hashtags: ["hashtags", k.hashtags.map((h) => h.tag).join(" ")], cta: ["cta", k.cta],
    onScreenText: ["onScreen", k.onScreenText.join("\n")], coverHeadline: ["coverHeadline", k.coverHeadline], audio: ["all", k.audio.suggestion],
  };
  const [field, text] = map[f] ?? ["all", ""];
  return { field, platform: pl, text };
}

/** "Hooks" → "hooks", "Instagram caption" stays capitalized. */
function sectionNoun(key: SectionKey) {
  const l = sectionLabel(key);
  return /^(TikTok|Instagram|Facebook)/.test(l) ? l : l.toLowerCase();
}

export interface ReasonAsk { ids: string[]; question: string }

export function useProject(id: string) {
  const { store, brand, aiEnabled, toast } = useApp();
  const [project, setProject] = useState<Project | null>(null);
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [versions, setVersions] = useState<Version[]>([]);
  const [missing, setMissing] = useState(false);
  const [save, setSave] = useState<SaveState>("saved");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<Project | null>(null);
  const mem = useBrandMemory();
  const memRef = useRef(mem);
  memRef.current = mem;
  const [askReason, setAskReason] = useState<ReasonAsk | null>(null);
  // edits are captured per field after a short pause, so typing isn't logged keystroke by keystroke
  const baseline = useRef<ContentPlan | null>(null);
  const editTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    (async () => {
      const p = await store.getProject(id);
      if (!p) { setMissing(true); return; }
      // A job that was "running" when the page closed didn't finish (it ran in this browser).
      if (p.jobs?.some((j) => j.status === "running")) {
        p.jobs = p.jobs.map((j) => (j.status === "running" ? { ...j, status: "failed" as const, message: "Interrupted when the page closed — your earlier work is intact. Run it again." } : j));
        if (p.stage === "analyzing") p.stage = p.plan ? "ready" : "setup";
        await store.saveProject(p);
      }
      latest.current = p;
      setProject(p);
      setAssets(await store.listMedia(id));
      setVersions(await store.listVersions(id));
    })().catch((e) => toast((e as Error).message, "error"));
  }, [id, store, toast]);

  const persist = useCallback(async (p: Project) => {
    setSave("saving");
    try { await store.saveProject(p); setSave("saved"); }
    catch (e) { setSave("error"); toast(`Not saved: ${(e as Error).message}`, "error"); }
  }, [store, toast]);

  /** Every change autosaves (debounced). */
  const update = useCallback((fn: (p: Project) => Project, immediate = false) => {
    setProject((prev) => {
      if (!prev) return prev;
      const next = { ...fn(deepClone(prev)), updatedAt: nowISO() };
      latest.current = next;
      if (timer.current) clearTimeout(timer.current);
      if (immediate) persist(next);
      else { setSave("saving"); timer.current = setTimeout(() => persist(next), 500); }
      return next;
    });
  }, [persist]);

  const decisionContext = (p: Project): DecisionEvent["context"] => ({ tone: p.tone, objective: p.objective, generatedBy: p.plan?.generatedBy });

  /** Turn pending edits into recorded decisions (one per changed field). */
  const flushEdits = useCallback(() => {
    if (editTimer.current) clearTimeout(editTimer.current);
    editTimer.current = null;
    const b = baseline.current, cur = latest.current;
    baseline.current = null;
    if (!b || !cur?.plan) return;
    const changes = diffPlans(b, cur.plan, cur.platforms);
    if (changes.length) void memRef.current.record(changes.map((c): NewDecision => ({ ...c, agent: "writer", projectId: cur.id, reasons: [], context: decisionContext(cur) })));
  }, []);

  const recordDecision = useCallback((list: Omit<NewDecision, "agent" | "projectId" | "context" | "reasons">[]) => {
    const cur = latest.current;
    if (!cur) return Promise.resolve([] as DecisionEvent[]);
    return memRef.current.record(list.map((d) => ({ ...d, agent: "writer", projectId: cur.id, reasons: [], context: decisionContext(cur) })));
  }, []);

  const answerReason = useCallback(async (reasons: ReasonCode[] | null) => {
    const ask = askReason;
    setAskReason(null);
    if (ask && reasons?.length) await memRef.current.attachReasons(ask.ids, reasons);
  }, [askReason]);

  // flush on unload
  useEffect(() => {
    const flush = () => { flushEdits(); if (timer.current && latest.current) { clearTimeout(timer.current); store.saveProject(latest.current); } };
    window.addEventListener("pagehide", flush);
    return () => { flush(); window.removeEventListener("pagehide", flush); };
  }, [store, flushEdits]);

  /** User edit of one section: apply it and lock that section against regeneration. */
  const editSection = useCallback((key: SectionKey, fn: (plan: ContentPlan) => ContentPlan) => {
    if (!baseline.current && latest.current?.plan) baseline.current = deepClone(latest.current.plan);
    if (editTimer.current) clearTimeout(editTimer.current);
    editTimer.current = setTimeout(flushEdits, 2500);
    update((p) => {
      if (!p.plan) return p;
      p.plan = fn(p.plan);
      if (p.locked[key] !== "approved") p.locked[key] = "edited";
      p.review = reviewPlan(p.plan, p, assets);
      if (p.stage === "approved") p.stage = "ready";
      return p;
    });
  }, [update, assets, flushEdits]);

  const snapshot = useCallback(async (label: string, p?: Project) => {
    const src = p ?? latest.current;
    if (!src?.plan) return;
    const v: Version = { id: uid(), projectId: src.id, createdAt: nowISO(), label, plan: deepClone(src.plan), locked: { ...src.locked } };
    await store.addVersion(v);
    setVersions((vs) => [v, ...vs]);
  }, [store]);

  const deps = {
    aiEnabled,
    getPreview: (a: MediaAsset) => previewFor(store, a),
    getBlob: (a: MediaAsset) => store.getMediaBlob(a),
    logUsage: (r: Parameters<typeof store.logUsage>[0]) => store.logUsage(r).catch(() => {}),
  };

  async function withJob<T>(kind: string, label: string, fn: (p: Project) => Promise<T>): Promise<T | undefined> {
    const p0 = latest.current;
    if (!p0 || !brand) return;
    const job = { id: uid(), kind, status: "running" as const, message: label, at: nowISO() };
    const p1 = { ...p0, jobs: [...(p0.jobs ?? []).slice(-4), job] };
    latest.current = p1; setProject(p1); await store.saveProject(p1);
    setBusy(label);
    try {
      const r = await fn(p1);
      update((p) => ({ ...p, jobs: (p.jobs ?? []).map((j) => (j.id === job.id ? { ...j, status: "done" as const } : j)) }), true);
      return r;
    } catch (e) {
      update((p) => ({ ...p, jobs: (p.jobs ?? []).map((j) => (j.id === job.id ? { ...j, status: "failed" as const, message: (e as Error).message } : j)) }), true);
      toast(`${label} failed: ${(e as Error).message}. Your saved work wasn't changed.`, "error");
    } finally {
      setBusy(null);
    }
  }

  /** Analyze media (if needed), then write the full plan. Locked sections survive. */
  const runFull = useCallback(async (opts: { reanalyze?: boolean } = {}) => {
    await withJob("generate", "Writing your content", async (p) => {
      if (!brand) return;
      let understanding = p.understanding;
      const notices: string[] = [];
      if (!understanding || opts.reanalyze) {
        setBusy(assets.length ? "Analyzing your media" : "Planning");
        const r = await analyze({ brand, project: p, assets }, deps);
        understanding = r.understanding;
        if (r.notice) notices.push(r.notice);
      }
      setBusy("Writing scripts and captions");
      if (p.plan) await snapshot("Before regenerating", p);
      flushEdits();
      const g = await generate({ brand, project: { ...p, understanding }, assets, understanding, ...memoryInput() }, deps, { current: p.plan, locked: p.locked });
      if (g.notice) notices.push(g.notice);
      setNotice(notices.join(" ") || null);
      update((x) => {
        x.understanding = understanding;
        x.plan = g.plan;
        x.stage = "ready";
        x.review = reviewPlan(g.plan, x, assets);
        return x;
      }, true);
      await snapshot(g.usedAI ? "AI draft" : "Template draft", { ...p, plan: g.plan });
      if (p.plan) {
        const before = sectionMemory(p.plan, "hooks").text, after = sectionMemory(g.plan, "hooks").text;
        const evs = await memRef.current.record([{ kind: "regenerate", field: "all", before, after, agent: "writer", projectId: p.id, reasons: [], context: decisionContext(p) }]);
        if (evs.length) setAskReason({ ids: evs.map((e) => e.id), question: "Why regenerate everything?" });
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brand, assets, aiEnabled]);

  /** Regenerate or rewrite one section; nothing else changes. */
  const runSection = useCallback(async (opts: GenOptions & { label: string }) => {
    await withJob("section", opts.label, async (p) => {
      if (!brand || !p.plan) return;
      flushEdits();
      await snapshot(`Before: ${opts.label}`, p);
      const g = await generate({ brand, project: p, assets, understanding: p.understanding, ...memoryInput() }, deps, { ...opts, current: p.plan, locked: p.locked });
      const key = opts.section ?? "script";
      const was = sectionMemory(p.plan, key), now = sectionMemory(g.plan, key);
      const kind = opts.rewrite || opts.tone ? "rewrite" : "regenerate";
      const evs = await memRef.current.record([{ kind, field: was.field, platform: was.platform, before: was.text, after: now.text, agent: "writer", projectId: p.id, reasons: [], context: { ...decisionContext(p), rewrite: opts.rewrite ?? (opts.tone ? `tone:${opts.tone}` : undefined) } }]);
      if (kind === "regenerate" && evs.length) setAskReason({ ids: evs.map((e) => e.id), question: `Why replace the ${sectionNoun(key)}?` });
      if (g.notice) setNotice(g.notice);
      update((x) => {
        x.plan = g.plan;
        const key = opts.section ?? "script";
        delete x.locked[key]; // fresh content — not yet edited or approved by you
        x.review = reviewPlan(g.plan, x, assets);
        if (x.stage === "approved") x.stage = "ready";
        return x;
      }, true);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brand, assets, aiEnabled]);

  function memoryInput() {
    const m = memRef.current;
    return { memory: m.rules, memoryPrompt: memoryForPrompt(m.rules, m.events) };
  }

  /** "Not this hook": remember the rejection and swap in a different hook right away. */
  const rejectHook = useCallback(async (i: number) => {
    flushEdits();
    const p = latest.current;
    if (!p?.plan || !brand) return;
    const old = p.plan.hooks[i];
    const evs = await memRef.current.record([{ kind: "reject", field: "hook", before: old.text, after: "", agent: "writer", projectId: p.id, reasons: [], context: { ...decisionContext(p), style: old.style } }]);
    const rules = memRef.current.rulesWith(evs);
    const avoid = hookAvoider(rules);
    const taken = new Set(p.plan.hooks.map((h) => norm(h.text)));
    let alt: { text: string; style: string } | undefined;
    for (let seed = 1; seed <= 24 && !alt; seed++) {
      const cand = generateTemplatePlan({ brand, project: p, assets, understanding: p.understanding, seed: seed * 7919, memory: rules });
      alt = [cand.hooks[i], ...cand.hooks].find((h) => !avoid.isAvoided(h.text) && !taken.has(norm(h.text)));
    }
    update((x) => {
      if (!x.plan) return x;
      if (alt) {
        if (x.plan.segments[0] && norm(x.plan.segments[0].spoken) === norm(old.text)) x.plan.segments[0].spoken = alt.text;
        x.plan.hooks[i] = { text: alt.text, style: alt.style };
      }
      x.review = reviewPlan(x.plan, x, assets);
      return x;
    }, true);
    if (!alt) toast("Noted. There's no fresh hook left to swap in — tap Rewrite hooks for a new set.");
    if (evs.length) setAskReason({ ids: evs.map((e) => e.id), question: "Why not this hook?" });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brand, assets, update, flushEdits, toast]);

  const restore = useCallback(async (v: Version) => {
    flushEdits();
    await snapshot("Before restoring");
    update((p) => { p.plan = deepClone(v.plan); p.locked = { ...v.locked }; p.review = reviewPlan(p.plan, p, assets); p.stage = "ready"; return p; }, true);
    toast(`Restored “${v.label}”.`);
  }, [snapshot, update, assets, toast, flushEdits]);

  const setAssetsAndSave = useCallback(async (list: MediaAsset[]) => {
    const ordered = list.map((a, i) => ({ ...a, order: i }));
    setAssets(ordered);
    for (const a of ordered) await store.saveMediaMeta(a);
    update((p) => ({ ...p, mediaIds: ordered.map((a) => a.id) }), true);
  }, [store, update]);

  return { project, assets, setAssets: setAssetsAndSave, versions, missing, save, busy, notice, setNotice, update, editSection, runFull, runSection, restore, snapshot, memory: mem, recordDecision, rejectHook, askReason, answerReason, flushEdits };
}

export type ProjectApi = ReturnType<typeof useProject>;
