"use client";
import { useRef, useState } from "react";
import { ingestFile } from "@/lib/ingest";
import { ACCEPT } from "@/lib/media";
import type { MediaAsset, SinglePictureMode, SpeakingStyle } from "@/lib/types";
import { OBJECTIVES, PLATFORMS, PLATFORM_LABEL, TONES } from "@/lib/types";
import { fmtSec } from "@/lib/util";
import { useApp } from "../AppProvider";
import { Icon, type IconName } from "../icons";
import { Field, Progress, cx } from "../ui";
import type { ProjectApi } from "./useProject";

export const PICTURE_MODES: { id: SinglePictureMode; title: string; desc: string; icon: IconName; phase3?: string }[] = [
  { id: "photo", title: "Keep it as a picture post", desc: "Captions, headline, hashtags, alt text. No video.", icon: "image" },
  { id: "short_video", title: "Turn it into a short video", desc: "Zoom, pan, animated text and CTA — 6 to 20 seconds.", icon: "video", phase3: "You'll get the motion plan and script now. Rendering the MP4 arrives in Phase 3." },
  { id: "voiceover", title: "Voiceover video", desc: "The photo with a word-for-word voiceover and subtitles.", icon: "mic", phase3: "Record your voiceover with the teleprompter now; the finished MP4 render is Phase 3." },
  { id: "talking", title: "Talk about it on camera", desc: "A script and filming directions for you to film yourself.", icon: "user" },
  { id: "story", title: "Story", desc: "A Story layout with text placement and sticker ideas.", icon: "layers" },
  { id: "carousel", title: "Carousel", desc: "Slide concepts. No invented photos — text slides or your own extra pictures.", icon: "images" },
];

const STYLES: { id: SpeakingStyle; label: string }[] = [
  { id: "talking", label: "Talking to camera" },
  { id: "voiceover", label: "Voiceover" },
  { id: "text_only", label: "Text only" },
  { id: "music_only", label: "Music only" },
  { id: "combo", label: "Voice + text + music" },
];

export function SetupPanel({ api }: { api: ProjectApi }) {
  const { project: p, assets, update, runFull, busy } = api;
  if (!p) return null;
  const singleImage = assets.length === 1 && assets[0].kind === "image";
  const needsPictureChoice = singleImage && !p.singlePictureMode;
  const ready = assets.length > 0 || p.idea.trim().length > 0;
  const q = p.understanding?.clarifyingQuestion;

  return (
    <div className="flex flex-col gap-6">
      <MediaManager api={api} />

      {singleImage && (
        <section aria-labelledby="hdyw">
          <h2 id="hdyw" className="text-lg font-bold mb-2">How do you want to use this picture?</h2>
          <div className="grid gap-2" role="radiogroup" aria-label="How do you want to use this picture?">
            {PICTURE_MODES.map((m) => (
              <button key={m.id} role="radio" aria-checked={p.singlePictureMode === m.id} data-testid={`pic-${m.id}`}
                onClick={() => update((x) => ({ ...x, singlePictureMode: m.id, speakingStyle: m.id === "voiceover" ? "voiceover" : m.id === "talking" ? "talking" : m.id === "short_video" ? "text_only" : x.speakingStyle }))}
                className={cx("panel text-left p-3 flex gap-3 items-start", p.singlePictureMode === m.id ? "!border-teal bg-teal/5" : "hover:border-teal/40")}>
                <Icon name={m.icon} className="text-teal mt-0.5 shrink-0" />
                <span>
                  <span className="block font-medium">{m.title}</span>
                  <span className="block text-sm text-mute">{m.desc}</span>
                  {m.phase3 && p.singlePictureMode === m.id && <span className="block text-xs text-warn mt-1">{m.phase3}</span>}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-4">
        <div>
          <span className="label">Platforms</span>
          <div className="flex flex-wrap gap-2">
            {PLATFORMS.map((pl) => {
              const on = p.platforms.includes(pl);
              return (
                <button key={pl} className={cx("chip", on && "chip-on")} aria-pressed={on}
                  onClick={() => update((x) => ({ ...x, platforms: on ? (x.platforms.length > 1 ? x.platforms.filter((y) => y !== pl) : x.platforms) : [...x.platforms, pl] }))}>
                  {on && <Icon name="check" size={14} />}{PLATFORM_LABEL[pl]}
                </button>
              );
            })}
          </div>
        </div>
        <Field label="Goal for this post">
          <select className="field" value={p.objective} onChange={(e) => update((x) => ({ ...x, objective: e.target.value as typeof x.objective }))}>
            {OBJECTIVES.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </Field>
        <Field label="Tone">
          <select className="field" value={p.tone} onChange={(e) => update((x) => ({ ...x, tone: e.target.value as typeof x.tone }))}>
            {TONES.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </Field>
        {p.singlePictureMode !== "photo" && p.singlePictureMode !== "story" && p.singlePictureMode !== "carousel" && (
          <Field label="How it's delivered">
            <select className="field" value={p.speakingStyle} onChange={(e) => update((x) => ({ ...x, speakingStyle: e.target.value as SpeakingStyle }))}>
              {STYLES.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </Field>
        )}
        <Field label="What is it?" hint="Name the product and who it's for. The writing only states facts you give here or that are visible in your media.">
          <textarea className="field min-h-[72px]" value={p.idea} data-testid="idea"
            placeholder="e.g. custom photo keychain for a bridal party"
            onChange={(e) => update((x) => ({ ...x, idea: e.target.value }))} />
        </Field>
        {q && (
          <div className="rounded-lg border border-teal/40 p-3 text-sm">
            <span className="text-teal">One question:</span> {q}
          </div>
        )}
        <Field label="Confirmed facts (optional)" hint="Prices, turnaround, materials — only what's true. Anything not listed here won't be claimed.">
          <textarea className="field min-h-[60px]" value={p.facts} placeholder="e.g. Ships in 5–7 business days. Keychains are $15."
            onChange={(e) => update((x) => ({ ...x, facts: e.target.value }))} />
        </Field>
      </section>

      <button className="btn-primary w-full !min-h-[52px] text-base" data-testid="generate"
        disabled={!!busy || !ready || needsPictureChoice} onClick={() => runFull({ reanalyze: !p.understanding })}>
        <Icon name="wand" size={18} />{p.plan ? "Regenerate everything (keeps your edits)" : "Analyze and write my post"}
      </button>
      {needsPictureChoice && <p className="text-sm text-mute -mt-4">Choose how to use the picture first.</p>}
    </div>
  );
}

function MediaManager({ api }: { api: ProjectApi }) {
  const { store, toast } = useApp();
  const { project: p, assets, setAssets, update } = api;
  const add = useRef<HTMLInputElement>(null);
  const rep = useRef<HTMLInputElement>(null);
  const [replacing, setReplacing] = useState<MediaAsset | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  if (!p) return null;

  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= assets.length) return;
    const l = assets.slice();
    [l[i], l[j]] = [l[j], l[i]];
    setAssets(l);
  };
  const remove = async (a: MediaAsset) => {
    if (!confirm(`Remove ${a.name} from this project? The file is deleted.`)) return;
    await store.deleteMedia(a);
    await setAssets(assets.filter((x) => x.id !== a.id));
    update((x) => ({ ...x, understanding: undefined }), true);
  };
  const ingest = async (files: File[], replace?: MediaAsset) => {
    const out: MediaAsset[] = [];
    for (const f of files) {
      setProgress(0);
      let err = "";
      const a = await ingestFile(store, p, f, replace ? replace.order : assets.length + out.length, (u) => { if (u.progress !== undefined) setProgress(u.progress); if (u.error) err = u.error; }, replace?.id);
      if (a) out.push(a); else toast(err || `Couldn't add ${f.name}.`, "error");
    }
    setProgress(null);
    if (!out.length) return;
    if (replace) await setAssets(assets.map((x) => (x.id === replace.id ? out[0] : x)));
    else await setAssets([...assets, ...out]);
    update((x) => ({ ...x, understanding: undefined, singlePictureMode: assets.length + out.length === 1 ? x.singlePictureMode : undefined }), true);
  };

  return (
    <section aria-labelledby="media-h">
      <div className="flex items-center justify-between mb-2">
        <h2 id="media-h" className="text-lg font-bold">Media</h2>
        <button className="btn-ghost !min-h-[36px] text-sm" onClick={() => add.current?.click()}><Icon name="plus" size={16} />Add</button>
      </div>
      {progress !== null && <div className="mb-2"><Progress value={progress} label="Adding media" /></div>}
      {assets.length === 0 ? (
        <p className="text-sm text-mute">No media yet — this post will be planned from your description. You can add photos or clips any time.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {assets.map((a, i) => (
            <li key={a.id} className="flex items-center gap-2.5 rounded-lg bg-ink border border-line p-2">
              <div className="h-14 w-10 rounded bg-graphite overflow-hidden shrink-0">
                {a.thumbnail && <img src={a.thumbnail} alt={`${a.kind} ${i + 1}`} className="h-full w-full object-cover" />}
              </div>
              <div className="min-w-0 flex-1 text-sm">
                <div className="truncate">{a.name}</div>
                <div className="text-mute text-xs">{a.kind === "video" ? `Video ${a.tech?.durationSec ? fmtSec(a.tech.durationSec) : ""}` : "Photo"} · {a.tech?.aspect}</div>
              </div>
              <div className="flex">
                <button className="btn-quiet !min-h-[36px] !px-1.5" aria-label={`Move ${a.name} up`} disabled={i === 0} onClick={() => move(i, -1)}><Icon name="up" size={16} /></button>
                <button className="btn-quiet !min-h-[36px] !px-1.5" aria-label={`Move ${a.name} down`} disabled={i === assets.length - 1} onClick={() => move(i, 1)}><Icon name="down" size={16} /></button>
                <button className="btn-quiet !min-h-[36px] !px-1.5" aria-label={`Replace ${a.name}`} onClick={() => { setReplacing(a); rep.current?.click(); }}><Icon name="replace" size={16} /></button>
                <button className="btn-quiet !min-h-[36px] !px-1.5" aria-label={`Remove ${a.name}`} onClick={() => remove(a)}><Icon name="trash" size={16} /></button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <input ref={add} type="file" multiple accept={ACCEPT} className="sr-only" onChange={(e) => { ingest(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
      <input ref={rep} type="file" accept={ACCEPT} className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f && replacing) ingest([f], replacing); e.target.value = ""; }} />
    </section>
  );
}
