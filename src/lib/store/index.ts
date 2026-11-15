import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { CLOUD_ENABLED, SUPABASE_ANON_KEY, SUPABASE_URL } from "../config";
import { cloudStore } from "./cloud";
import { localStore } from "./local";
import type { Store } from "./types";

let _sb: SupabaseClient | null = null;
export function supabase(): SupabaseClient | null {
  if (!CLOUD_ENABLED) return null;
  if (!_sb) _sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
  return _sb;
}

let _store: Store | null = null;
export function getStore(): Store {
  if (_store) return _store;
  const sb = supabase();
  _store = sb ? cloudStore(sb, SUPABASE_URL, SUPABASE_ANON_KEY) : localStore();
  return _store;
}

export type { Store };
