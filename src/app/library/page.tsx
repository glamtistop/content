"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { Icon } from "@/components/icons";
import { Empty, PageHeader } from "@/components/ui";
import type { MediaAsset, Project } from "@/lib/types";
import { fmtBytes, fmtSec } from "@/lib/util";

export default function Library() {
  const { brand, store, toast } = useApp();
  const [media, setMedia] = useState<MediaAsset[] | null>(null);
  const [projects, setProjects] = useState<Record<string, Project>>({});
  useEffect(() => {
    if (!brand) return;
    store.listBrandMedia(brand.id).then(setMedia);
    store.listProjects(brand.id).then((ps) => setProjects(Object.fromEntries(ps.map((p) => [p.id, p]))));
  }, [brand, store]);
  if (!brand) return null;
  const total = media?.reduce((s, m) => s + m.size, 0) ?? 0;

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader title="Media library" sub={media ? `${media.length} files · ${fmtBytes(total)} · stored ${store.mode === "local" ? "on this device" : "privately in your account"}` : undefined}
        action={<Link href="/create/" className="btn-primary"><Icon name="upload" size={18} />Upload</Link>} />
      {media === null ? <p className="text-mute">Loading…</p> : media.length === 0 ? (
        <Empty icon="images" title="No media yet" action={<Link href="/create/" className="btn-primary">Upload photos or clips</Link>}>Everything you upload for {brand.name} appears here.</Empty>
      ) : (
        <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {media.map((m) => (
            <li key={m.id} className="panel overflow-hidden">
              <Link href={`/workspace/?id=${m.projectId}`} className="block aspect-[3/4] bg-ink">
                {m.thumbnail ? <img src={m.thumbnail} alt={m.name} className="h-full w-full object-cover" /> : null}
              </Link>
              <div className="p-2.5 text-sm">
                <div className="truncate">{m.name}</div>
                <div className="text-xs text-mute truncate">{m.kind === "video" && m.tech?.durationSec ? `${fmtSec(m.tech.durationSec)} · ` : ""}{fmtBytes(m.size)} · {projects[m.projectId]?.name ?? "—"}</div>
                <button className="btn-quiet !min-h-[32px] !px-0 text-xs mt-1" onClick={async () => {
                  if (!confirm(`Delete ${m.name}? It's removed from its project too.`)) return;
                  await store.deleteMedia(m);
                  const p = projects[m.projectId];
                  if (p) await store.saveProject({ ...p, mediaIds: p.mediaIds.filter((x) => x !== m.id), understanding: undefined });
                  setMedia((l) => l!.filter((x) => x.id !== m.id));
                  toast("Deleted.");
                }}><Icon name="trash" size={14} />Delete</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
