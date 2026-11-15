import type { BrandProfile, MediaAsset, Project, UsageRecord, Version } from "../types";

export interface Store {
  mode: "local" | "cloud";
  listBrands(): Promise<BrandProfile[]>;
  saveBrand(b: BrandProfile): Promise<void>;
  deleteBrand(id: string): Promise<void>;

  listProjects(brandId: string): Promise<Project[]>;
  getProject(id: string): Promise<Project | undefined>;
  saveProject(p: Project): Promise<void>;
  deleteProject(id: string): Promise<void>;

  listMedia(projectId: string): Promise<MediaAsset[]>;
  listBrandMedia(brandId: string): Promise<MediaAsset[]>;
  saveMediaMeta(a: MediaAsset): Promise<void>;
  /** Uploads the original file. Calls onProgress(0..1). Retries are the caller's choice. */
  putMediaBlob(a: MediaAsset, blob: Blob, onProgress?: (f: number) => void): Promise<void>;
  getMediaBlob(a: MediaAsset): Promise<Blob | undefined>;
  deleteMedia(a: MediaAsset): Promise<void>;

  listVersions(projectId: string): Promise<Version[]>;
  addVersion(v: Version): Promise<void>;

  logUsage(r: UsageRecord): Promise<void>;
  listUsage(): Promise<UsageRecord[]>;

  /** Deletes every brand, project, media file, version and usage record for this account. */
  deleteEverything(): Promise<void>;
}
