"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { analyze, generate, type GenOptions } from "@/lib/generate";
import { reviewPlan } from "@/lib/generate/review";
import { previewFor } from "@/lib/ingest";
import type { ContentPlan, MediaAsset, Project, SectionKey, Version } from "@/lib/types";
import { deepClone, nowISO, uid } from "@/lib/util";
import { useApp } from "../AppProvider";

export type SaveState = "saved" | "saving" | "error";

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

  // flush on unload
  useEffect(() => {
    const flush = () => { if (timer.current && latest.current) { clearTimeout(timer.current); store.saveProject(latest.current); } };
    window.addEventListener("pagehide", flush);
    return () => { flush(); window.removeEventListener("pagehide", flush); };
  }, [store]);

  /** User edit of one section: apply it and lock that section against regeneration. */
  const editSection = useCallback((key: SectionKey, fn: (plan: ContentPlan) => ContentPlan) => {
    update((p) => {
      if (!p.plan) return p;
      p.plan = fn(p.plan);
      if (p.locked[key] !== "approved") p.locked[key] = "edited";
      p.review = reviewPlan(p.plan, p, assets);
      if (p.stage === "approved") p.stage = "ready";
      return p;
    });
  }, [update, assets]);

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
      const g = await generate({ brand, project: { ...p, understanding }, assets, understanding }, deps, { current: p.plan, locked: p.locked });
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
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brand, assets, aiEnabled]);

  /** Regenerate or rewrite one section; nothing else changes. */
  const runSection = useCallback(async (opts: GenOptions & { label: string }) => {
    await withJob("section", opts.label, async (p) => {
      if (!brand || !p.plan) return;
      await snapshot(`Before: ${opts.label}`, p);
      const g = await generate({ brand, project: p, assets, understanding: p.understanding }, deps, { ...opts, current: p.plan, locked: p.locked });
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

  const restore = useCallback(async (v: Version) => {
    await snapshot("Before restoring");
    update((p) => { p.plan = deepClone(v.plan); p.locked = { ...v.locked }; p.review = reviewPlan(p.plan, p, assets); p.stage = "ready"; return p; }, true);
    toast(`Restored “${v.label}”.`);
  }, [snapshot, update, assets, toast]);

  const setAssetsAndSave = useCallback(async (list: MediaAsset[]) => {
    const ordered = list.map((a, i) => ({ ...a, order: i }));
    setAssets(ordered);
    for (const a of ordered) await store.saveMediaMeta(a);
    update((p) => ({ ...p, mediaIds: ordered.map((a) => a.id) }), true);
  }, [store, update]);

  return { project, assets, setAssets: setAssetsAndSave, versions, missing, save, busy, notice, setNotice, update, editSection, runFull, runSection, restore, snapshot };
}

export type ProjectApi = ReturnType<typeof useProject>;
