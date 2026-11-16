"use client";
import { useEffect, useRef, useState } from "react";
import { estimateDuration, DEFAULT_WPM, fitToDuration, spokenScript, wordCount } from "@/lib/duration";
import { REWRITES } from "@/lib/generate";
import type { ContentPlan, MediaAsset, ScriptSegment } from "@/lib/types";
import { TONES } from "@/lib/types";
import { fmtSec, uid } from "@/lib/util";
import { useApp } from "../AppProvider";
import { Icon } from "../icons";
import { CopyButton, EvidenceBadge, cx } from "../ui";
import { Teleprompter } from "./Teleprompter";
import type { ProjectApi } from "./useProject";

export function useBlobUrl(a: MediaAsset | undefined) {
  const { store } = useApp();
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!a) return;
    let u: string | undefined;
    let alive = true;
    store.getMediaBlob(a).then((b) => { if (b && alive) { u = URL.createObjectURL(b); setUrl(u); } }).catch(() => {});
    return () => { alive = false; if (u) URL.revokeObjectURL(u); setUrl(undefined); };
  }, [a, store]);
  return url;
}

export function MediaPreview({ api }: { api: ProjectApi }) {
  const { assets } = api;
  const [sel, setSel] = useState(0);
  const a = assets[Math.min(sel, assets.length - 1)];
  const url = useBlobUrl(a);
  const vid = useRef<HTMLVideoElement>(null);
  if (!a) return null;
  return (
    <section aria-label="Media preview" className="panel p-3">
      <div className="flex gap-3 flex-col sm:flex-row">
        <div className="sm:w-56 shrink-0 aspect-[9/16] max-h-[420px] bg-ink rounded-lg overflow-hidden mx-auto">
          {a.kind === "video"
            ? url ? <video ref={vid} src={url} controls playsInline className="h-full w-full object-contain" /> : <img src={a.thumbnail} alt="" className="h-full w-full object-contain" />
            : <img src={url ?? a.thumbnail} alt={a.name} className="h-full w-full object-contain" />}
        </div>
        <div className="min-w-0 flex-1 text-sm">
          {assets.length > 1 && (
            <div className="flex gap-1.5 overflow-x-auto scrollbar-thin pb-2 mb-2">
              {assets.map((x, i) => (
                <button key={x.id} onClick={() => setSel(i)} className={cx("h-14 w-10 shrink-0 rounded overflow-hidden border-2", i === sel ? "border-teal" : "border-transparent")} aria-label={`Show ${x.name}`}>
                  <img src={x.thumbnail} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
          <div className="font-medium truncate">{a.name}</div>
          {a.tech && (
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 mt-2 text-mute">
              <dt>Size</dt><dd className="text-paper">{a.tech.width}×{a.tech.height} ({a.tech.aspect}, {a.tech.orientation})</dd>
              {a.tech.durationSec !== undefined && <><dt>Length</dt><dd className="text-paper">{fmtSec(a.tech.durationSec)}</dd></>}
              <dt>Focus</dt><dd className="text-paper">{a.tech.sharpness}/100</dd>
              <dt>Light</dt><dd className="text-paper">{a.tech.brightness}/100</dd>
            </dl>
          )}
          {a.tech?.notes.length ? <ul className="mt-2 list-disc pl-4 text-mute">{a.tech.notes.map((n) => <li key={n}>{n}</li>)}</ul> : null}
          {a.tech?.frames && (
            <>
              <p className="text-mute mt-3 mb-1">Frames sampled from your clip (real timestamps):</p>
              <div className="flex gap-1.5 overflow-x-auto scrollbar-thin pb-1">
                {a.tech.frames.map((f) => (
                  <button key={f.t} className="shrink-0 text-center" onClick={() => { if (vid.current) vid.current.currentTime = f.t; }} aria-label={`Jump to ${fmtSec(f.t)}`}>
                    <img src={f.dataUrl} alt="" className={cx("h-16 w-auto rounded border", f.sharpness < 22 || f.brightness < 22 ? "border-warn/60" : "border-line")} />
                    <span className="text-[11px] text-mute">{fmtSec(f.t)}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

export function Understanding({ api }: { api: ProjectApi }) {
  const u = api.project?.understanding;
  const assets = api.assets;
  if (!u) return null;
  const o = u.observed;
  const where = (assetId?: string, t?: number) => {
    const i = assets.findIndex((a) => a.id === assetId);
    if (i < 0) return "";
    return t !== undefined ? `Clip ${i + 1} at ${fmtSec(t)}` : `${assets[i].kind === "video" ? "Clip" : "Photo"} ${i + 1}`;
  };
  return (
    <details className="panel p-4 group" open>
      <summary className="cursor-pointer list-none flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold">What's in your media</h2>
        <span className="text-xs text-mute">{u.source === "ai" ? `Analyzed by ${u.provider}` : "Technical checks only"}</span>
      </summary>
      <div className="grid md:grid-cols-2 gap-4 mt-3 text-sm">
        <div>
          <h3 className="font-semibold text-teal mb-1">Observed</h3>
          <p className="text-mute mb-2">Detected in your files.</p>
          {o.summary && <p className="mb-2">{o.summary}</p>}
          <List label="Products" items={o.products} />
          <List label="Subjects" items={o.subjects} />
          {o.setting && <p><span className="text-mute">Setting:</span> {o.setting}</p>}
          <List label="On-screen text" items={o.onScreenText} />
          <List label="Activities" items={o.activities} />
          {o.transcript && <p className="mt-1"><span className="text-mute">Speech:</span> “{o.transcript}”</p>}
          {o.moments.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1">{o.moments.map((m, i) => <li key={i}><span className="text-mute">{where(m.assetId, m.t)}</span> {m.description}</li>)}</ul>
          )}
          <List label="Quality" items={o.qualityNotes} />
          {u.source !== "ai" && !o.summary && <p className="text-mute">AI analysis isn't connected, so nothing about the content of your media was assumed.</p>}
        </div>
        <div>
          <h3 className="font-semibold mb-1">Suggested</h3>
          <p className="text-mute mb-2">Recommendations — not facts.</p>
          <List label="Hook ideas" items={u.suggested.hooks} />
          <List label="Possible audiences" items={u.suggested.audiences} />
          <List label="Scene order" items={u.suggested.usableSceneOrder} />
          {!u.suggested.hooks.length && <p className="text-mute">See the script below.</p>}
        </div>
      </div>
    </details>
  );
}
function List({ label, items }: { label: string; items: string[] }) {
  if (!items.length) return null;
  return <p className="mb-1"><span className="text-mute">{label}:</span> {items.join(", ")}</p>;
}

// ---------------- script editor ----------------
const DURATIONS = [6, 10, 15, 20, 25, 30, 45, 60, 90];

export function ScriptEditor({ api }: { api: ProjectApi }) {
  const { project: p, editSection, runSection, busy, update } = api;
  const { brand, saveBrand, toast } = useApp();
  const [prompter, setPrompter] = useState(false);
  if (!p?.plan) return null;
  const plan = p.plan;
  const wpm = p.speakingRateWpm || DEFAULT_WPM;
  const est = estimateDuration(plan.segments, wpm);
  const over = est.totalSec - plan.targetDurationSec;
  const scriptLocked = p.locked.script;
  const setSegs = (fn: (s: ScriptSegment[]) => ScriptSegment[]) => editSection("script", (pl) => ({ ...pl, segments: fn(pl.segments.map((s) => ({ ...s }))) }));
  const fullText = () => plan.segments.map((s, i) => `${i + 1}. ${s.label}\nSAY: ${s.spoken || "(silent)"}\nON SCREEN: ${s.onScreen}\nVISUAL: ${s.visual}${s.direction ? `\nDIRECTION: ${s.direction}` : ""}`).join("\n\n");

  return (
    <section aria-labelledby="script-h" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div>
          <h2 id="script-h" className="text-2xl font-bold">{plan.concept.title}</h2>
          <p className="text-sm text-mute">{plan.concept.angle}</p>
          {plan.memoryApplied?.length ? (
            <p className="text-xs text-teal mt-1" data-testid="memory-applied">Applied what you've taught me: {plan.memoryApplied.join("; ")}</p>
          ) : null}
        </div>
        <span className={cx("text-xs rounded-full border px-2.5 py-1", plan.generatedBy === "ai" ? "border-teal/50 text-teal" : "border-warn/50 text-warn")}>
          {plan.generatedBy === "ai" ? `Written by AI (${plan.provider})` : "Template writer — no AI"}
        </span>
      </div>

      {/* hooks */}
      <div className={cx("panel p-4", p.locked.hooks === "approved" && "approved")}>
        <div className="flex items-center justify-between gap-2 mb-2">
          <h3 className="font-semibold">Opening hooks</h3>
          <div className="flex gap-1">
            <LockChip state={p.locked.hooks} />
            <button className="btn-ghost !min-h-[36px] text-sm" disabled={!!busy} onClick={() => runSection({ section: "hooks", label: "Rewriting hooks" })} data-testid="rewrite-hook"><Icon name="refresh" size={16} />Rewrite hooks</button>
          </div>
        </div>
        <div className="flex flex-col gap-2" role="radiogroup" aria-label="Choose a hook">
          {plan.hooks.map((h, i) => (
            <div key={i} className={cx("rounded-lg border p-2.5 flex gap-2.5 items-start", plan.recommendedHook.index === i ? "border-teal/60 bg-teal/5" : "border-line")}>
              <input type="radio" className="mt-2.5 accent-[#19D3C5] h-4 w-4" checked={plan.recommendedHook.index === i} aria-label={`Use hook ${i + 1}`}
                onChange={() => editSection("hooks", (pl) => {
                  const segs = pl.segments.map((s, k) => (k === 0 && s.spoken ? { ...s, spoken: pl.hooks[i].text } : s));
                  return { ...pl, recommendedHook: { ...pl.recommendedHook, index: i }, segments: segs };
                })} />
              <div className="flex-1 min-w-0">
                <span className="text-[11px] text-mute">{h.style}{plan.recommendedHook.index === i ? " · in use" : ""}</span>
                <input className="field !py-1.5 mt-0.5" value={h.text} data-testid={`hook-${i}`} aria-label={`Hook ${i + 1}`}
                  onChange={(e) => editSection("hooks", (pl) => ({ ...pl, hooks: pl.hooks.map((x, k) => (k === i ? { ...x, text: e.target.value } : x)) }))} />
              </div>
              <button className="btn-quiet !min-h-[36px] !px-2 mt-4 shrink-0" disabled={!!busy} data-testid={`reject-hook-${i}`}
                aria-label={`Not this hook: ${h.text}`} title="Not this one — swap it and don't suggest it again"
                onClick={() => api.rejectHook(i)}><Icon name="x" size={16} /></button>
            </div>
          ))}
        </div>
        <p className="text-sm text-mute mt-2">Why the recommended one: {plan.recommendedHook.reason}</p>
      </div>

      {p.singlePictureMode !== "photo" && (
        <>
          {/* duration */}
          <div className="panel p-4">
            <div className="flex flex-wrap items-end gap-4">
              <label>
                <span className="label">Target length</span>
                <select className="field !w-28" value={plan.targetDurationSec} data-testid="target"
                  onChange={(e) => editSection("script", (pl) => ({ ...pl, targetDurationSec: +e.target.value }))}>
                  {[...new Set([...DURATIONS, plan.targetDurationSec])].sort((a, b) => a - b).map((d) => <option key={d} value={d}>{d}s</option>)}
                </select>
              </label>
              <div>
                <span className="label">Estimated</span>
                <div className={cx("text-2xl font-display font-bold", over > 1 ? "text-warn" : "text-teal")} data-testid="estimate">{est.totalSec.toFixed(1)}s</div>
              </div>
              <label className="flex-1 min-w-[180px]">
                <span className="label">Speaking speed: {wpm} words/min</span>
                <input type="range" min={110} max={200} step={5} value={wpm} className="w-full accent-[#19D3C5]"
                  onChange={(e) => update((x) => ({ ...x, speakingRateWpm: +e.target.value }))} />
              </label>
            </div>
            <p className="text-xs text-mute mt-2">
              {est.words} words: speaking {est.breakdown.speaking.toFixed(1)}s + pauses {est.breakdown.pauses.toFixed(1)}s + demos {est.breakdown.demos.toFixed(1)}s + transitions {est.breakdown.transitions.toFixed(1)}s + end card {est.breakdown.endCard}s. {plan.durationReason}
            </p>
            {over > 1 && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                <span className="text-warn">About {over.toFixed(0)}s over target.</span>
                <button className="btn-ghost !min-h-[36px]" onClick={() => setSegs((s) => fitToDuration(s, plan.targetDurationSec, wpm))}>Fit to {plan.targetDurationSec}s</button>
              </div>
            )}
          </div>

          {/* segments */}
          <div className={cx("flex flex-col gap-2", scriptLocked === "approved" && "approved rounded-xl")}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold">Word-for-word script</h3>
              <div className="flex flex-wrap gap-1.5">
                <LockChip state={scriptLocked} />
                <CopyButton text={() => spokenScript(plan.segments)} label="Copy script" testid="copy-script" />
                <CopyButton text={fullText} label="Copy with directions" />
                <button className="btn-ghost !min-h-[36px] text-sm" onClick={() => setPrompter(true)} data-testid="open-teleprompter"><Icon name="teleprompter" size={16} />Teleprompter</button>
              </div>
            </div>
            {plan.segments.map((s, i) => (
              <SegmentCard key={s.id} s={s} i={i} sec={est.segments[i]?.totalSec ?? 0} assets={api.assets}
                onChange={(patch) => setSegs((segs) => segs.map((x) => (x.id === s.id ? { ...x, ...patch } : x)))}
                onRemove={plan.segments.length > 1 ? () => setSegs((segs) => segs.filter((x) => x.id !== s.id)) : undefined} />
            ))}
            <button className="btn-quiet self-start text-sm" onClick={() => setSegs((s) => [...s.slice(0, -1), { id: uid(), label: "New scene", spoken: "", onScreen: "", visual: "", direction: "", demoSec: 0 }, ...s.slice(-1)])}>
              <Icon name="plus" size={16} />Add scene
            </button>
          </div>

          <div className="panel p-4">
            <h3 className="font-semibold mb-2">Rewrite the script</h3>
            <div className="flex flex-wrap gap-1.5">
              {REWRITES.map((r) => (
                <button key={r.id} className="chip" disabled={!!busy} onClick={() => runSection({ rewrite: r.id, label: r.label })} data-testid={`rw-${r.id}`}>{r.label}</button>
              ))}
              <select className="field !w-auto !py-1.5 text-sm" value="" aria-label="Change tone" disabled={!!busy}
                onChange={(e) => e.target.value && runSection({ section: "script", tone: e.target.value as typeof p.tone, label: "Changing tone" })}>
                <option value="">Change tone…</option>
                {TONES.filter((t) => t.id !== "custom").map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              <button className="btn-ghost text-sm" data-testid="save-preferred" onClick={async () => {
                if (!brand) return;
                const text = spokenScript(plan.segments);
                await saveBrand({ ...brand, approvedExamples: [...brand.approvedExamples.filter((x) => x !== text), text].slice(-12) });
                update((x) => ({ ...x, locked: { ...x.locked, script: "approved" } }), true);
                await api.recordDecision([{ kind: "prefer", field: "spoken", before: "", after: text }]);
                await api.snapshot("Preferred version");
                toast("Saved as a preferred version. Future scripts will learn from it.");
              }}><Icon name="check" size={16} />Save preferred version</button>
            </div>
            <p className="text-xs text-mute mt-2">Only scripts you save as preferred are used to learn your voice.</p>
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            <div className={cx("panel p-4", p.locked.shortScript && "approved")}>
              <div className="flex items-center justify-between mb-1"><h3 className="font-semibold">Short version</h3><CopyButton text={plan.shortScript} /></div>
              <textarea className="field min-h-[90px] text-sm" value={plan.shortScript} aria-label="Short version"
                onChange={(e) => editSection("shortScript", (pl) => ({ ...pl, shortScript: e.target.value }))} />
              <p className="text-xs text-mute mt-1">{wordCount(plan.shortScript)} words · about {((wordCount(plan.shortScript) / wpm) * 60).toFixed(0)}s spoken</p>
            </div>
            <div className="panel p-4">
              <h3 className="font-semibold mb-1">Alternate angle</h3>
              <p className="text-sm text-paper/90">{plan.altAngle}</p>
            </div>
          </div>

          <EditPlan plan={plan} />
        </>
      )}

      {plan.photo && <PhotoPost api={api} />}
      {prompter && <Teleprompter text={spokenScript(plan.segments) || plan.segments.map((s) => s.onScreen).join("\n")} onClose={() => setPrompter(false)} />}
    </section>
  );
}

export function LockChip({ state }: { state?: "edited" | "approved" }) {
  if (!state) return null;
  return state === "approved"
    ? <span className="inline-flex items-center gap-1 text-xs text-gold border border-gold/50 rounded-full px-2 py-1"><Icon name="check" size={12} />Approved</span>
    : <span className="inline-flex items-center gap-1 text-xs text-mute border border-line rounded-full px-2 py-1" title="You edited this. Regenerating everything won't overwrite it."><Icon name="lock" size={12} />Your edit</span>;
}

function SegmentCard({ s, i, sec, assets, onChange, onRemove }: { s: ScriptSegment; i: number; sec: number; assets: MediaAsset[]; onChange: (p: Partial<ScriptSegment>) => void; onRemove?: () => void }) {
  const src = s.sourceRef ? assets.findIndex((a) => a.id === s.sourceRef!.assetId) : -1;
  return (
    <div className="panel p-3.5" data-testid="segment">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs text-mute w-5">{i + 1}</span>
        <input className="bg-transparent font-semibold flex-1 min-w-0 focus:outline-none border-b border-transparent focus:border-teal" value={s.label} onChange={(e) => onChange({ label: e.target.value })} aria-label="Scene name" />
        {src >= 0 && <span className="text-[11px] text-teal border border-teal/40 rounded-full px-2 py-0.5">{s.sourceRef!.t !== undefined ? `Clip ${src + 1} at ${fmtSec(s.sourceRef!.t)}` : `Photo ${src + 1}`}</span>}
        <span className="text-xs text-mute">~{sec.toFixed(1)}s</span>
        {onRemove && <button className="btn-quiet !min-h-[32px] !px-1" onClick={onRemove} aria-label={`Remove scene ${i + 1}`}><Icon name="x" size={16} /></button>}
      </div>
      <div className="grid gap-2">
        <label><span className="text-xs text-teal">Say</span>
          <textarea className="field text-[15px] min-h-[64px]" value={s.spoken} placeholder="(silent — on-screen text only)" onChange={(e) => onChange({ spoken: e.target.value })} data-testid="seg-spoken" />
        </label>
        <div className="grid sm:grid-cols-2 gap-2">
          <label><span className="text-xs text-mute">On-screen text</span>
            <input className="field text-sm" value={s.onScreen} onChange={(e) => onChange({ onScreen: e.target.value })} />
          </label>
          <label><span className="text-xs text-mute">Extra demo seconds</span>
            <input type="number" min={0} max={30} step={0.5} className="field text-sm" value={s.demoSec} onChange={(e) => onChange({ demoSec: Math.max(0, +e.target.value) })} />
          </label>
        </div>
        <label><span className="text-xs text-mute">Visual / what to film</span>
          <input className="field text-sm" value={s.visual} onChange={(e) => onChange({ visual: e.target.value })} />
        </label>
        <label><span className="text-xs text-mute">Direction (pauses, transitions, demo)</span>
          <input className="field text-sm" value={s.direction} onChange={(e) => onChange({ direction: e.target.value })} />
        </label>
      </div>
    </div>
  );
}

function EditPlan({ plan }: { plan: ContentPlan }) {
  return (
    <div className="panel p-4">
      <div className="flex items-center justify-between gap-2 mb-1">
        <h3 className="font-semibold">Edit plan</h3>
        <span className="text-xs text-warn border border-warn/40 rounded-full px-2 py-0.5">Estimated storyboard — not a rendered video</span>
      </div>
      <ul className="list-disc pl-5 text-sm flex flex-col gap-1">{plan.editPlan.map((x) => <li key={x}>{x}</li>)}</ul>
      {plan.missingFootage.length > 0 && (
        <>
          <h4 className="font-semibold text-sm mt-3">Missing footage</h4>
          <ul className="list-disc pl-5 text-sm">{plan.missingFootage.map((x) => <li key={x}>{x}</li>)}</ul>
        </>
      )}
    </div>
  );
}

function PhotoPost({ api }: { api: ProjectApi }) {
  const { project: p, editSection } = api;
  const ph = p?.plan?.photo;
  if (!p || !ph) return null;
  const mode = p.singlePictureMode;
  const set = (patch: Partial<typeof ph>) => editSection("photo", (pl) => ({ ...pl, photo: { ...pl.photo!, ...patch } }));
  return (
    <div className={cx("flex flex-col gap-3", p.locked.photo === "approved" && "approved rounded-xl")}>
      {(mode === "photo" || mode === "carousel" || mode === "story") && (
        <div className="panel p-4">
          <div className="flex items-center justify-between mb-2"><h3 className="font-semibold">Picture post</h3><LockChip state={p.locked.photo} /></div>
          <span className="label">Caption options</span>
          <div className="flex flex-col gap-2">
            {ph.captions.map((c, i) => (
              <div key={i} className="flex gap-2 items-start">
                <textarea className="field text-sm min-h-[70px]" value={c} aria-label={`Caption option ${i + 1}`} data-testid={`photo-caption-${i}`}
                  onChange={(e) => set({ captions: ph.captions.map((x, k) => (k === i ? e.target.value : x)) })} />
                <CopyButton text={c} label="" className="!px-2.5" />
              </div>
            ))}
          </div>
          <div className="grid sm:grid-cols-2 gap-3 mt-3">
            <label><span className="label">Headline</span><input className="field text-sm" value={ph.headline} onChange={(e) => set({ headline: e.target.value })} /></label>
            <label><span className="label">Text overlay (optional)</span><input className="field text-sm" value={ph.overlay} onChange={(e) => set({ overlay: e.target.value })} /></label>
          </div>
          <label className="block mt-3"><span className="label">Suggested audience</span><input className="field text-sm" value={ph.audience} onChange={(e) => set({ audience: e.target.value })} /></label>
          <label className="block mt-3">
            <span className="label">Alt text — review before posting</span>
            <textarea className="field text-sm min-h-[64px]" value={ph.altText} onChange={(e) => set({ altText: e.target.value })} data-testid="alt-text" />
          </label>
          <div className="mt-2"><CopyButton text={ph.altText} label="Copy alt text" /></div>
        </div>
      )}
      {mode === "story" && ph.storyLayout && (
        <div className="panel p-4">
          <h3 className="font-semibold mb-2">Story layout</h3>
          <ol className="list-decimal pl-5 text-sm flex flex-col gap-1">{ph.storyLayout.map((x) => <li key={x}>{x}</li>)}</ol>
          <p className="text-xs text-mute mt-2">Layout plan — place stickers in the app. Sticker availability depends on your account.</p>
        </div>
      )}
      {mode === "carousel" && ph.carouselSlides && (
        <div className="panel p-4">
          <h3 className="font-semibold mb-2">Carousel slides</h3>
          <ol className="flex flex-col gap-2">{ph.carouselSlides.map((s) => (
            <li key={s.title} className="rounded-lg border border-line p-2.5 text-sm"><b>{s.title}</b><div>{s.body}</div><div className="text-mute text-xs mt-0.5">Needs: {s.needs}</div></li>
          ))}</ol>
          <p className="text-xs text-mute mt-2">Slide concepts only. Nothing here invents photos; rendering slide images arrives with Phase 3.</p>
        </div>
      )}
      {mode === "short_video" && ph.motionPlan && (
        <div className="panel p-4">
          <div className="flex items-center justify-between gap-2 mb-2">
            <h3 className="font-semibold">Motion plan</h3>
            <span className="text-xs text-warn border border-warn/40 rounded-full px-2 py-0.5">Storyboard — MP4 rendering is Phase 3</span>
          </div>
          <ol className="list-decimal pl-5 text-sm">{ph.motionPlan.map((m) => <li key={m.effect}>{m.effect} — {m.seconds}s</li>)}</ol>
          <p className="text-xs text-mute mt-2">Durations you can choose: 6, 10, 15 or 20 seconds. 10 seconds fits one reveal and a CTA.</p>
        </div>
      )}
      <div className="text-xs text-mute flex items-center gap-2"><EvidenceBadge e="inferred" />Copy is based on your description and brand profile.</div>
    </div>
  );
}
