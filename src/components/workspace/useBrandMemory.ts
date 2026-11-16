"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { learnRules } from "@/lib/memory";
import type { DecisionEvent, PreferenceRule, ReasonCode } from "@/lib/types";
import { nowISO, uid } from "@/lib/util";
import { useApp } from "../AppProvider";

export type NewDecision = Omit<DecisionEvent, "id" | "brandId" | "at">;

/**
 * Loads, records and re-learns the active brand's memory (feature 5).
 * Saving never blocks the user's work: if the database tables are missing
 * (migration 002 not run yet), memory keeps working for this session and says so once.
 */
export function useBrandMemory() {
  const { store, brand, toast } = useApp();
  const [rules, setRules] = useState<PreferenceRule[]>([]);
  const [events, setEvents] = useState<DecisionEvent[]>([]);
  const rulesRef = useRef<PreferenceRule[]>([]);
  const eventsRef = useRef<DecisionEvent[]>([]);
  const learnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warned = useRef(false);
  const brandId = brand?.id;

  const warn = useCallback((e: unknown) => {
    if (warned.current) return;
    warned.current = true;
    toast(`Learning isn't being saved: ${(e as Error).message}. If you use an account, run supabase/migrations/002_memory.sql in Supabase (see SUPABASE_SETUP.md).`, "error");
  }, [toast]);

  useEffect(() => {
    if (!brandId) return;
    let alive = true;
    (async () => {
      try {
        const [r, e] = await Promise.all([store.listRules(brandId), store.listDecisions(brandId)]);
        if (!alive) return;
        rulesRef.current = r; eventsRef.current = e;
        setRules(r); setEvents(e);
      } catch (err) { warn(err); }
    })();
    return () => { alive = false; };
  }, [brandId, store, warn]);

  const relearn = useCallback(async () => {
    if (!brandId) return rulesRef.current;
    const { rules: next, removedIds } = learnRules(eventsRef.current, rulesRef.current, brandId);
    rulesRef.current = next;
    setRules(next);
    try {
      await store.saveRules(next);
      await store.deleteRules(removedIds);
    } catch (err) { warn(err); }
    return next;
  }, [brandId, store, warn]);

  const scheduleRelearn = useCallback(() => {
    if (learnTimer.current) clearTimeout(learnTimer.current);
    learnTimer.current = setTimeout(() => { void relearn(); }, 600);
  }, [relearn]);

  /** Records decisions; returns them with ids so a reason can be attached later. */
  const record = useCallback(async (list: NewDecision[]): Promise<DecisionEvent[]> => {
    if (!brandId || !list.length) return [];
    const full = list.map((d) => ({ ...d, id: uid(), brandId, at: nowISO() }));
    eventsRef.current = [...eventsRef.current, ...full];
    setEvents(eventsRef.current);
    for (const e of full) {
      try { await store.saveDecision(e); } catch (err) { warn(err); break; }
    }
    scheduleRelearn();
    return full;
  }, [brandId, store, warn, scheduleRelearn]);

  /** Attach the one-tap reasons the user picked to decisions already recorded. */
  const attachReasons = useCallback(async (ids: string[], reasons: ReasonCode[], reasonText?: string) => {
    if (!reasons.length && !reasonText) return;
    const updated: DecisionEvent[] = [];
    eventsRef.current = eventsRef.current.map((e) => {
      if (!ids.includes(e.id)) return e;
      const u = { ...e, reasons, reasonText: reasonText || undefined };
      updated.push(u);
      return u;
    });
    setEvents(eventsRef.current);
    for (const e of updated) {
      try { await store.saveDecision(e); } catch (err) { warn(err); break; }
    }
    await relearn();
  }, [store, warn, relearn]);

  /** Rules as they'd be with some extra decisions — used to act on a rejection immediately. */
  const rulesWith = useCallback((extra: DecisionEvent[]) => {
    if (!brandId) return rulesRef.current;
    return learnRules([...eventsRef.current, ...extra.filter((x) => !eventsRef.current.some((e) => e.id === x.id))], rulesRef.current, brandId).rules;
  }, [brandId]);

  /** The user turns a rule on or off (or rewords it). Learning never overrides this.
   *  Switching off a rejected hook allows that hook again. */
  const setRule = useCallback(async (rule: PreferenceRule, patch: Partial<Pick<PreferenceRule, "status" | "text">>) => {
    const next = rulesRef.current.map((r) => (r.id === rule.id ? { ...r, ...patch, userSet: true, updatedAt: nowISO() } : r));
    rulesRef.current = next;
    setRules(next);
    try { await store.saveRules(next.filter((r) => r.id === rule.id)); } catch (err) { warn(err); }
  }, [store, warn]);

  const reset = useCallback(async () => {
    if (!brandId) return;
    await store.clearMemory(brandId);
    rulesRef.current = []; eventsRef.current = [];
    setRules([]); setEvents([]);
  }, [brandId, store]);

  return { rules, events, record, attachReasons, rulesWith, relearn, setRule, reset };
}

export type BrandMemory = ReturnType<typeof useBrandMemory>;
