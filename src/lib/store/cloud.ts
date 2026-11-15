import type { SupabaseClient } from "@supabase/supabase-js";
import type { BrandProfile, MediaAsset, Project, UsageRecord, Version } from "../types";
import type { Store } from "./types";

const BUCKET = "media";

/**
 * Supabase mode. Rows hold the same JSON shapes as local mode in a `data` jsonb column.
 * Row-level security (see supabase/migrations) restricts every row and file to its owner.
 */
export function cloudStore(sb: SupabaseClient, url: string, anonKey: string): Store {
  async function userId() {
    const { data } = await sb.auth.getUser();
    if (!data.user) throw new Error("You're signed out. Sign in again to keep saving.");
    return data.user.id;
  }
  async function rows<T>(table: string, filter?: [string, string]) {
    let q = sb.from(table).select("data");
    if (filter) q = q.eq(filter[0], filter[1]);
    const { data, error } = await q;
    if (error) throw new Error(`Couldn't load ${table}: ${error.message}`);
    return (data ?? []).map((r: { data: T }) => r.data);
  }
  async function upsert(table: string, row: Record<string, unknown>) {
    const { error } = await sb.from(table).upsert({ ...row, user_id: await userId() });
    if (error) throw new Error(`Couldn't save to ${table}: ${error.message}`);
  }
  async function del(table: string, col: string, val: string) {
    const { error } = await sb.from(table).delete().eq(col, val);
    if (error) throw new Error(`Couldn't delete from ${table}: ${error.message}`);
  }

  const store: Store = {
    mode: "cloud",
    listBrands: () => rows<BrandProfile>("brands"),
    saveBrand: (b) => upsert("brands", { id: b.id, data: b, updated_at: b.updatedAt }),
    deleteBrand: async (id) => {
      const media = await rows<MediaAsset>("media_assets", ["brand_id", id]);
      await removeFiles(media);
      await del("brands", "id", id); // projects, media rows and versions cascade
    },
    listProjects: async (brandId) =>
      (await rows<Project>("projects", ["brand_id", brandId])).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    getProject: async (id) => (await rows<Project>("projects", ["id", id]))[0],
    saveProject: (p) => upsert("projects", { id: p.id, brand_id: p.brandId, data: p, updated_at: p.updatedAt }),
    deleteProject: async (id) => {
      await removeFiles(await rows<MediaAsset>("media_assets", ["project_id", id]));
      await del("projects", "id", id);
    },
    listMedia: async (projectId) =>
      (await rows<MediaAsset>("media_assets", ["project_id", projectId])).sort((a, b) => a.order - b.order),
    listBrandMedia: async (brandId) =>
      (await rows<MediaAsset>("media_assets", ["brand_id", brandId])).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    saveMediaMeta: (a) =>
      upsert("media_assets", { id: a.id, project_id: a.projectId, brand_id: a.brandId, storage_path: a.storagePath ?? null, data: a }),
    putMediaBlob: async (a, blob, onProgress) => {
      const uidv = await userId();
      const path = `${uidv}/${a.projectId}/${a.id}`;
      const { data: s } = await sb.auth.getSession();
      const token = s.session?.access_token;
      if (!token) throw new Error("You're signed out. Sign in again to upload.");
      // XHR rather than supabase-js so we get real upload progress events.
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `${url}/storage/v1/object/${BUCKET}/${path}`);
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);
        xhr.setRequestHeader("apikey", anonKey);
        xhr.setRequestHeader("x-upsert", "true");
        xhr.setRequestHeader("Content-Type", a.mime || "application/octet-stream");
        xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
        xhr.onload = () =>
          xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status}). ${xhr.status === 413 ? "The file is larger than your storage limit allows." : "Tap retry."}`));
        xhr.onerror = () => reject(new Error("Upload interrupted — check your connection and tap retry."));
        xhr.send(blob);
      });
      a.storagePath = path;
      onProgress?.(1);
    },
    getMediaBlob: async (a) => {
      if (!a.storagePath) return undefined;
      const { data, error } = await sb.storage.from(BUCKET).download(a.storagePath);
      if (error) throw new Error(`Couldn't open ${a.name}: ${error.message}`);
      return data;
    },
    deleteMedia: async (a) => {
      await removeFiles([a]);
      await del("media_assets", "id", a.id);
    },
    listVersions: async (projectId) =>
      (await rows<Version>("versions", ["project_id", projectId])).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    addVersion: (v) => upsert("versions", { id: v.id, project_id: v.projectId, data: v, created_at: v.createdAt }),
    logUsage: (r) => upsert("api_usage", { id: r.id, data: r, created_at: r.at }),
    listUsage: async () => (await rows<UsageRecord>("api_usage")).sort((a, b) => b.at.localeCompare(a.at)),
    deleteEverything: async () => {
      const { error } = await sb.functions.invoke("ai", { body: { action: "delete_account" } });
      if (error) throw new Error("Account deletion failed: " + error.message);
      await sb.auth.signOut();
    },
  };

  async function removeFiles(media: MediaAsset[]) {
    const paths = media.map((m) => m.storagePath).filter(Boolean) as string[];
    if (paths.length) await sb.storage.from(BUCKET).remove(paths);
  }
  return store;
}
