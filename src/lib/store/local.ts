import Dexie, { type Table } from "dexie";
import type { BrandProfile, MediaAsset, Project, UsageRecord, Version } from "../types";
import type { Store } from "./types";

class DB extends Dexie {
  brands!: Table<BrandProfile, string>;
  projects!: Table<Project, string>;
  media!: Table<MediaAsset, string>;
  blobs!: Table<{ id: string; blob: Blob }, string>;
  versions!: Table<Version, string>;
  usage!: Table<UsageRecord, string>;
  constructor(name = "contentpilot") {
    super(name);
    this.version(1).stores({
      brands: "id",
      projects: "id, brandId, updatedAt",
      media: "id, projectId, brandId",
      blobs: "id",
      versions: "id, projectId, createdAt",
      usage: "id, at",
    });
  }
}

/** "This device" mode: everything stays in the browser's IndexedDB. */
export function localStore(name?: string): Store {
  const db = new DB(name);
  return {
    mode: "local",
    listBrands: () => db.brands.toArray(),
    saveBrand: async (b) => void (await db.brands.put(b)),
    deleteBrand: async (id) => {
      const projects = await db.projects.where("brandId").equals(id).toArray();
      for (const p of projects) await deleteProjectDeep(p.id);
      await db.media.where("brandId").equals(id).delete();
      await db.brands.delete(id);
    },
    listProjects: async (brandId) =>
      (await db.projects.where("brandId").equals(brandId).toArray()).sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt)),
    getProject: (id) => db.projects.get(id),
    saveProject: async (p) => void (await db.projects.put(p)),
    deleteProject: (id) => deleteProjectDeep(id),
    listMedia: async (projectId) =>
      (await db.media.where("projectId").equals(projectId).toArray()).sort((a, b) => a.order - b.order),
    listBrandMedia: async (brandId) =>
      (await db.media.where("brandId").equals(brandId).toArray()).sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt)),
    saveMediaMeta: async (a) => void (await db.media.put(a)),
    putMediaBlob: async (a, blob, onProgress) => {
      onProgress?.(0);
      await db.blobs.put({ id: a.id, blob });
      onProgress?.(1);
    },
    getMediaBlob: async (a) => (await db.blobs.get(a.id))?.blob,
    deleteMedia: async (a) => {
      await db.blobs.delete(a.id);
      await db.media.delete(a.id);
    },
    listVersions: async (projectId) =>
      (await db.versions.where("projectId").equals(projectId).toArray()).sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt)),
    addVersion: async (v) => void (await db.versions.put(v)),
    logUsage: async (r) => void (await db.usage.put(r)),
    listUsage: async () => (await db.usage.toArray()).sort((a, b) => b.at.localeCompare(a.at)),
    deleteEverything: async () => {
      await Promise.all([db.brands.clear(), db.projects.clear(), db.media.clear(), db.blobs.clear(), db.versions.clear(), db.usage.clear()]);
    },
  };

  async function deleteProjectDeep(id: string) {
    const media = await db.media.where("projectId").equals(id).toArray();
    await db.blobs.bulkDelete(media.map((m) => m.id));
    await db.media.bulkDelete(media.map((m) => m.id));
    await db.versions.where("projectId").equals(id).delete();
    await db.projects.delete(id);
  }
}
