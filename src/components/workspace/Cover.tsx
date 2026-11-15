"use client";
import { useEffect, useState } from "react";
import { download, renderCover, safeName, type CoverOptions } from "@/lib/export";
import type { MediaAsset } from "@/lib/types";
import { fmtSec } from "@/lib/util";
import { useApp } from "../AppProvider";
import { Modal, Notice, cx } from "../ui";
import type { ProjectApi } from "./useProject";

async function fullResSource(blob: Blob, a: MediaAsset, t?: number): Promise<string> {
  const url = URL.createObjectURL(blob);
  if (a.kind === "image") return url;
  const v = document.createElement("video");
  v.muted = true; v.playsInline = true; v.src = url;
  await new Promise<void>((res, rej) => { v.onloadeddata = () => res(); v.onerror = () => rej(new Error("Couldn't read the video frame.")); });
  await new Promise<void>((res) => { v.onseeked = () => res(); v.currentTime = t ?? 0.1; setTimeout(res, 3000); });
  const c = document.createElement("canvas");
  c.width = v.videoWidth; c.height = v.videoHeight;
  c.getContext("2d")!.drawImage(v, 0, 0);
  URL.revokeObjectURL(url);
  return c.toDataURL("image/jpeg", 0.92);
}

export function CoverDesigner({ api, onClose }: { api: ProjectApi; onClose: () => void }) {
  const { store, brand } = useApp();
  const { project: p, assets } = api;
  const plan = p!.plan!;
  const options: { a: MediaAsset; t?: number; thumb: string; label: string }[] = assets.flatMap((a, i) =>
    a.kind === "video" && a.tech?.frames?.length
      ? a.tech.frames.map((f) => ({ a, t: f.t, thumb: f.dataUrl, label: `Clip ${i + 1} at ${fmtSec(f.t)}` }))
      : [{ a, thumb: a.thumbnail, label: `${a.kind === "video" ? "Clip" : "Photo"} ${i + 1}` }]);
  const recIdx = Math.max(0, options.findIndex((o) => o.a.id === plan.cover.assetId && (plan.cover.frameT === undefined || o.t === plan.cover.frameT)));
  const [sel, setSel] = useState(recIdx);
  const [src, setSrc] = useState<string>();
  const [err, setErr] = useState("");
  const headlines = { Curiosity: plan.cover.headlines.curiosity, Premium: plan.cover.headlines.premium, "Direct sales": plan.cover.headlines.direct };
  const [o, setO] = useState<CoverOptions>({ headline: plan.cover.headlines.premium, position: "bottom", size: 92, color: "#F4F6F6", band: true, handle: brand?.handles.instagram, accent: "#19D3C5" });
  const [preview, setPreview] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const opt = options[sel];
    if (!opt) return;
    setSrc(undefined); setErr("");
    store.getMediaBlob(opt.a).then((b) => (b ? fullResSource(b, opt.a, opt.t) : opt.thumb)).then(setSrc).catch((e) => { setErr(e.message); setSrc(opt.thumb); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel]);

  useEffect(() => {
    if (!src) return;
    let url: string | undefined;
    const t = setTimeout(() => {
      renderCover(src, { ...o, size: o.size / 3, handle: o.handle }, 360, 640).then((b) => { url = URL.createObjectURL(b); setPreview(url); }).catch(() => {});
    }, 120);
    return () => { clearTimeout(t); if (url) URL.revokeObjectURL(url); };
  }, [src, o]);

  return (
    <Modal open onClose={onClose} title="Cover designer" wide>
      <div className="grid md:grid-cols-[minmax(0,240px)_1fr] gap-5">
        <div className="relative mx-auto w-[240px] aspect-[9/16] rounded-lg overflow-hidden bg-ink border border-line">
          {preview && <img src={preview} alt="Cover preview" className="h-full w-full" />}
          {/* crop-safe guides: app UI covers the top and the bottom-right */}
          <div className="absolute inset-x-0 top-0 h-[11.5%] bg-bad/15 border-b border-dashed border-bad/60" aria-hidden="true" />
          <div className="absolute inset-x-0 bottom-0 h-[22%] bg-bad/15 border-t border-dashed border-bad/60" aria-hidden="true" />
          <div className="absolute right-0 top-[40%] bottom-[22%] w-[15%] bg-bad/10 border-l border-dashed border-bad/50" aria-hidden="true" />
        </div>
        <div className="flex flex-col gap-3 text-sm">
          <p className="text-mute">Shaded areas are usually covered by app buttons. {plan.cover.reason}</p>
          {err && <Notice kind="warn">{err}</Notice>}
          <div>
            <span className="label">Image</span>
            <div className="flex gap-1.5 overflow-x-auto scrollbar-thin pb-1">
              {options.map((x, i) => (
                <button key={i} onClick={() => setSel(i)} className={cx("shrink-0 rounded border-2", i === sel ? "border-teal" : "border-transparent")} aria-label={x.label} title={x.label}>
                  <img src={x.thumb} alt="" className="h-16 w-auto rounded" />
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="label">Headline style</span>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(headlines).map(([k, h]) => <button key={k} className={cx("chip", o.headline === h && "chip-on")} onClick={() => setO({ ...o, headline: h })}>{k}</button>)}
            </div>
            <input className="field mt-2" value={o.headline} onChange={(e) => setO({ ...o, headline: e.target.value })} aria-label="Headline" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label><span className="label">Position</span>
              <select className="field" value={o.position} onChange={(e) => setO({ ...o, position: e.target.value as CoverOptions["position"] })}>
                <option value="top">Top</option><option value="middle">Middle</option><option value="bottom">Bottom</option>
              </select>
            </label>
            <label><span className="label">Text colour</span>
              <select className="field" value={o.color} onChange={(e) => setO({ ...o, color: e.target.value })}>
                <option value="#F4F6F6">White</option><option value="#19D3C5">Teal</option><option value="#C9A85A">Gold</option><option value="#000000">Black</option>
              </select>
            </label>
          </div>
          <label><span className="label">Text size</span><input type="range" min={56} max={140} value={o.size} onChange={(e) => setO({ ...o, size: +e.target.value })} className="w-full accent-[#19D3C5]" /></label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={o.band} onChange={(e) => setO({ ...o, band: e.target.checked })} className="accent-[#19D3C5] h-4 w-4" />Dark band behind text (better contrast)</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={!!o.handle} onChange={(e) => setO({ ...o, handle: e.target.checked ? brand?.handles.instagram : undefined })} className="accent-[#19D3C5] h-4 w-4" />Show {brand?.handles.instagram}</label>
          <button className="btn-primary mt-2" disabled={!src || busy} data-testid="export-cover" onClick={async () => {
            setBusy(true);
            try { download(`${safeName(p!.name)}-cover-1080x1920.png`, await renderCover(src!, o)); } catch (e) { setErr((e as Error).message); }
            setBusy(false);
          }}>Export cover — 1080×1920 PNG</button>
        </div>
      </div>
    </Modal>
  );
}
