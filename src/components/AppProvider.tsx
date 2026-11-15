"use client";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CLOUD_ENABLED } from "@/lib/config";
import { printQueenBrand } from "@/lib/defaultBrand";
import { getStore, supabase, type Store } from "@/lib/store";
import type { BrandProfile } from "@/lib/types";
import { nowISO } from "@/lib/util";

interface Toast { id: number; text: string; kind: "ok" | "error" }
interface Ctx {
  ready: boolean;
  store: Store;
  brands: BrandProfile[];
  brand: BrandProfile | null;
  userEmail: string | null;
  aiEnabled: boolean;
  setAiEnabled: (v: boolean) => void;
  setActiveBrand: (id: string) => void;
  saveBrand: (b: BrandProfile) => Promise<void>;
  removeBrand: (id: string) => Promise<void>;
  toast: (text: string, kind?: Toast["kind"]) => void;
}
const AppCtx = createContext<Ctx | null>(null);
export const useApp = () => {
  const c = useContext(AppCtx);
  if (!c) throw new Error("useApp outside provider");
  return c;
};

const LS = { brand: "cp.activeBrand", ai: "cp.ai" };
const ls = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

export function AppProvider({ children }: { children: ReactNode }) {
  const store = useMemo(() => getStore(), []);
  const router = useRouter();
  const path = usePathname();
  const [ready, setReady] = useState(false);
  const [brands, setBrands] = useState<BrandProfile[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [aiPref, setAiPref] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const tid = useRef(0);

  const toast = useCallback((text: string, kind: Toast["kind"] = "ok") => {
    const id = ++tid.current;
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "error" ? 7000 : 3200);
  }, []);

  const load = useCallback(async () => {
    let list = await store.listBrands();
    if (!list.length) {
      const b = printQueenBrand();
      await store.saveBrand(b);
      list = [b];
    }
    list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    setBrands(list);
    const saved = ls.get(LS.brand);
    setActiveId(list.find((b) => b.id === saved)?.id ?? list[0].id);
  }, [store]);

  useEffect(() => {
    setAiPref(ls.get(LS.ai) !== "off");
    (async () => {
      if (CLOUD_ENABLED) {
        const sb = supabase()!;
        const { data } = await sb.auth.getSession();
        if (!data.session) {
          setReady(true);
          if (!path?.startsWith("/login")) router.replace("/login");
          return;
        }
        setUserEmail(data.session.user.email ?? null);
        sb.auth.onAuthStateChange((_e, s) => {
          setUserEmail(s?.user.email ?? null);
          if (!s) router.replace("/login");
        });
      }
      try { await load(); } catch (e) { toast((e as Error).message, "error"); }
      setReady(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value: Ctx = {
    ready,
    store,
    brands,
    brand: brands.find((b) => b.id === activeId) ?? null,
    userEmail,
    aiEnabled: CLOUD_ENABLED && aiPref,
    setAiEnabled: (v) => { setAiPref(v); ls.set(LS.ai, v ? "on" : "off"); },
    setActiveBrand: (id) => { setActiveId(id); ls.set(LS.brand, id); },
    saveBrand: async (b) => {
      const nb = { ...b, updatedAt: nowISO() };
      await store.saveBrand(nb);
      setBrands((list) => (list.some((x) => x.id === nb.id) ? list.map((x) => (x.id === nb.id ? nb : x)) : [...list, nb]));
    },
    removeBrand: async (id) => {
      await store.deleteBrand(id);
      const rest = brands.filter((b) => b.id !== id);
      setBrands(rest);
      if (activeId === id && rest[0]) { setActiveId(rest[0].id); ls.set(LS.brand, rest[0].id); }
      if (!rest.length) await load();
    },
    toast,
  };

  return (
    <AppCtx.Provider value={value}>
      {children}
      <div className="fixed z-[60] left-1/2 -translate-x-1/2 flex flex-col gap-2 w-[min(92vw,420px)]" style={{ bottom: "calc(88px + var(--safe-bottom))" }} aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`rounded-lg px-4 py-3 text-sm shadow-lg border ${t.kind === "error" ? "bg-[#2a1214] border-bad/60 text-[#ffd0d0]" : "bg-graphite border-teal/40"}`}>{t.text}</div>
        ))}
      </div>
    </AppCtx.Provider>
  );
}
