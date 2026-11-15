import type { ContentPlan, Platform, Project, SectionKey } from "../types";
import { PLATFORMS } from "../types";
import { deepClone } from "../util";

type PkgField = "caption" | "hashtags" | "cta" | "onScreenText" | "coverHeadline" | "audio";
const PKG_FIELDS: PkgField[] = ["caption", "hashtags", "cta", "onScreenText", "coverHeadline", "audio"];

export function allSectionKeys(): SectionKey[] {
  const keys: SectionKey[] = ["hooks", "script", "shortScript", "photo", "cover"];
  for (const p of PLATFORMS) for (const f of PKG_FIELDS) keys.push(`pkg.${p}.${f}` as SectionKey);
  return keys;
}

export function getSection(plan: ContentPlan, key: SectionKey): unknown {
  if (key === "hooks") return { hooks: plan.hooks, recommendedHook: plan.recommendedHook };
  if (key === "script") return { segments: plan.segments, targetDurationSec: plan.targetDurationSec };
  if (key === "shortScript") return plan.shortScript;
  if (key === "photo") return plan.photo;
  if (key === "cover") return plan.cover;
  const [, p, f] = key.split(".") as [string, Platform, PkgField];
  const pkg = plan.packages[p];
  if (f === "caption") return { caption: pkg.caption, shortCaption: pkg.shortCaption };
  return pkg[f];
}

export function setSection(plan: ContentPlan, key: SectionKey, value: unknown): ContentPlan {
  const out = deepClone(plan);
  const v = deepClone(value) as never;
  if (key === "hooks") Object.assign(out, v);
  else if (key === "script") Object.assign(out, v);
  else if (key === "shortScript") out.shortScript = v;
  else if (key === "photo") out.photo = v;
  else if (key === "cover") out.cover = v;
  else {
    const [, p, f] = key.split(".") as [string, Platform, PkgField];
    if (f === "caption") Object.assign(out.packages[p], v);
    else (out.packages[p] as unknown as Record<string, unknown>)[f] = v;
  }
  return out;
}

/** Take a freshly generated plan, but keep every section the user edited or approved. */
export function mergeRespectingLocks(current: ContentPlan | undefined, fresh: ContentPlan, locked: Project["locked"]): ContentPlan {
  if (!current) return fresh;
  let out = deepClone(fresh);
  for (const key of Object.keys(locked) as SectionKey[]) {
    if (!locked[key]) continue;
    const cur = getSection(current, key);
    if (cur !== undefined) out = setSection(out, key, cur);
  }
  return out;
}

/** Replace exactly one section with the version from `fresh`. Everything else stays as it is. */
export function replaceOneSection(current: ContentPlan, fresh: ContentPlan, key: SectionKey): ContentPlan {
  return setSection(current, key, getSection(fresh, key));
}

export function sectionLabel(key: SectionKey): string {
  if (key === "hooks") return "Hooks";
  if (key === "script") return "Script";
  if (key === "shortScript") return "Short version";
  if (key === "photo") return "Photo post";
  if (key === "cover") return "Cover";
  const [, p, f] = key.split(".");
  const names: Record<string, string> = { caption: "caption", hashtags: "hashtags", cta: "call to action", onScreenText: "on-screen text", coverHeadline: "cover headline", audio: "audio" };
  return `${p[0].toUpperCase() + p.slice(1)} ${names[f]}`;
}
