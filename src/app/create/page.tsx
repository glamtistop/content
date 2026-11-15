"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useRef, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { Icon, type IconName } from "@/components/icons";
import { Notice, PageHeader, Progress, cx } from "@/components/ui";
import { LIMITS } from "@/lib/config";
import { ingestFile, newProject, type UploadItem } from "@/lib/ingest";
import { ACCEPT } from "@/lib/media";
import type { Project } from "@/lib/types";
import { fmtBytes, nowISO } from "@/lib/util";

type Mode = "one-photo" | "photos" | "video" | "clips" | "mix" | "idea";
const MODES: { id: Mode; label: string; icon: IconName; accept: string; multiple: boolean }[] = [
  { id: "one-photo", label: "1 picture", icon: "image", accept: ".jpg,.jpeg,.png,.webp,.heic,.heif,image/*", multiple: false },
  { id: "photos", label: "Several pictures", icon: "images", accept: ".jpg,.jpeg,.png,.webp,.heic,.heif,image/*", multiple: true },
  { id: "video", label: "1 video", icon: "video", accept: ".mp4,.mov,.m4v,video/mp4,video/quicktime", multiple: false },
  { id: "clips", label: "Several clips", icon: "clips", accept: ".mp4,.mov,.m4v,video/mp4,video/quicktime", multiple: true },
  { id: "mix", label: "Pictures + videos", icon: "mix", accept: ACCEPT, multiple: true },
  { id: "idea", label: "From an idea", icon: "bulb", accept: "", multiple: false },
];

export default function CreatePage() {
  return <Suspense><Create /></Suspense>;
}

function Create() {
  const params = useSearchParams();
  const router = useRouter();
  const { brand, store, toast } = useApp();
  const [mode, setMode] = useState<Mode>((params.get("mode") as Mode) || "mix");
  const [idea, setIdea] = useState(params.get("idea") ?? "");
  const [items, setItems] = useState<UploadItem[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const m = MODES.find((x) => x.id === mode) ?? MODES[4];

  if (!brand) return null;

  const patch = (key: string, p: Partial<UploadItem>) => setItems((list) => list.map((i) => (i.key === key ? { ...i, ...p } : i)));

  async function start(files: File[]) {
    if (!brand) return;
    if (!files.length) return;
    if (!m.multiple && files.length > 1) files = files.slice(0, 1);
    if (files.length > LIMITS.filesPerProject) {
      toast(`Up to ${LIMITS.filesPerProject} files per post. Using the first ${LIMITS.filesPerProject}.`, "error");
      files = files.slice(0, LIMITS.filesPerProject);
    }
    const p = project ?? newProject(brand, { idea });
    p.stage = "media";
    await store.saveProject(p);
    setProject(p);
    const fresh = files.map((f, i) => ({ key: `${Date.now()}-${i}-${f.name}`, file: f, name: f.name, stage: "checking" as const, progress: 0 }));
    setItems((l) => [...l, ...fresh]);
    await runAll(p, fresh);
  }

  async function runAll(p: Project, list: UploadItem[]) {
    const ids = [...p.mediaIds];
    for (const it of list) {
      const a = await ingestFile(store, p, it.file, ids.length, (x) => patch(it.key, x));
      if (a) {
        ids.push(a.id);
        p = { ...p, mediaIds: ids, updatedAt: nowISO(), stage: "setup" };
        await store.saveProject(p); // saved after each file, so leaving mid-upload keeps what finished
        setProject(p);
      }
    }
    return p;
  }

  async function retry(it: UploadItem) {
    if (!project) return;
    patch(it.key, { stage: "checking", progress: 0, error: undefined });
    await runAll(project, [it]);
  }

  const allDone = items.length > 0 && items.every((i) => i.stage === "done" || i.stage === "error");
  const okCount = items.filter((i) => i.stage === "done").length;

  async function fromIdea() {
    if (!brand || !idea.trim()) return;
    const p = newProject(brand, { idea: idea.trim(), name: idea.trim().slice(0, 60) });
    p.stage = "setup";
    await store.saveProject(p);
    router.push(`/workspace/?id=${p.id}`);
  }

  return (
    <div className="max-w-3xl mx-auto">
      <PageHeader title="Create new post" sub="Add your photos or clips. Nothing is posted anywhere — you review everything first." />

      <div className="flex gap-2 overflow-x-auto scrollbar-thin pb-2 mb-5 -mx-1 px-1" role="tablist" aria-label="What are you starting with?">
        {MODES.map((x) => (
          <button key={x.id} role="tab" aria-selected={mode === x.id} disabled={items.length > 0 && x.id === "idea"}
            className={cx("chip shrink-0", mode === x.id && "chip-on")} onClick={() => setMode(x.id)}>
            <Icon name={x.icon} size={16} />{x.label}
          </button>
        ))}
      </div>

      {mode === "idea" ? (
        <div className="panel p-5">
          <label className="label" htmlFor="idea">Describe the post you want to make</label>
          <textarea id="idea" className="field min-h-[120px]" value={idea} onChange={(e) => setIdea(e.target.value)}
            placeholder="e.g. Show how I make a custom NFC payment stand for a coffee shop" />
          <p className="text-sm text-mute mt-2">You'll get a full script, shot list and captions. You can add footage later.</p>
          <button className="btn-primary mt-4 w-full sm:w-auto" disabled={!idea.trim()} onClick={fromIdea}>Plan this post</button>
        </div>
      ) : (
        <>
          <div
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); start(Array.from(e.dataTransfer.files)); }}
            className={cx("rounded-2xl border-2 border-dashed p-8 sm:p-12 text-center transition-colors", drag ? "border-teal bg-teal/5" : "border-line")}
          >
            <Icon name="upload" size={32} className="mx-auto text-teal" />
            <p className="mt-3 text-lg">Drop {m.multiple ? "files" : "a file"} here</p>
            <p className="text-sm text-mute mt-1">JPG, PNG, WEBP, HEIC, MP4 or MOV · photos up to {fmtBytes(LIMITS.imageBytes)}, videos up to {fmtBytes(LIMITS.videoBytes)}</p>
            <button className="btn-primary mt-5" onClick={() => input.current?.click()} data-testid="choose-files">
              Choose from library
            </button>
            <input ref={input} type="file" className="sr-only" accept={m.accept} multiple={m.multiple} data-testid="file-input"
              onChange={(e) => { start(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
          </div>

          <div className="mt-4">
            <label className="label" htmlFor="desc">What is it? (optional, helps the writing)</label>
            <input id="desc" className="field" value={idea} placeholder="e.g. custom photo keychain for a bridal party"
              onChange={(e) => { setIdea(e.target.value); if (project) { const p = { ...project, idea: e.target.value }; setProject(p); store.saveProject(p); } }} />
          </div>
        </>
      )}

      {items.length > 0 && (
        <section className="mt-6" aria-label="Upload progress">
          <ul className="flex flex-col gap-2">
            {items.map((it) => (
              <li key={it.key} className="panel p-3">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate">{it.name}</span>
                  <span className={cx("shrink-0", it.stage === "error" ? "text-bad" : it.stage === "done" ? "text-teal" : "text-mute")}>
                    {{ checking: "Checking", converting: "Converting HEIC", analyzing: "Analyzing", saving: "Saving", done: "Ready", error: "Failed" }[it.stage]}
                  </span>
                </div>
                {it.stage !== "error" && <div className="mt-2"><Progress value={it.progress} label={`${it.name} progress`} /></div>}
                {it.error && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="text-sm text-[#ffb3b3] flex-1">{it.error}</span>
                    <button className="btn-ghost !min-h-[36px] text-sm" onClick={() => retry(it)}>Retry</button>
                    <button className="btn-quiet text-sm" onClick={() => setItems((l) => l.filter((x) => x.key !== it.key))}>Remove</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
          {allDone && (
            <div className="mt-4 flex flex-col sm:flex-row gap-2 sm:items-center">
              {okCount === 0 ? <Notice kind="error">None of the files could be used. Check the messages above.</Notice> : (
                <>
                  <button className="btn-primary sm:w-auto w-full" data-testid="continue" onClick={() => router.push(`/workspace/?id=${project!.id}`)}>
                    Continue with {okCount} file{okCount > 1 ? "s" : ""}
                  </button>
                  {m.multiple && <button className="btn-ghost" onClick={() => input.current?.click()}>Add more</button>}
                </>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
