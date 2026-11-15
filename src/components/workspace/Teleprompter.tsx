"use client";
import { useEffect, useRef, useState } from "react";
import { download } from "@/lib/export";
import { Icon } from "../icons";
import { cx } from "../ui";

/** Full-screen mobile teleprompter with adjustable size/speed, mirror mode, and optional voice recording. */
export function Teleprompter({ text, onClose }: { text: string; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [size, setSize] = useState(40);
  const [speed, setSpeed] = useState(40); // px per second
  const [mirror, setMirror] = useState(false);
  const [rec, setRec] = useState<MediaRecorder | null>(null);
  const [recErr, setRecErr] = useState("");
  const chunks = useRef<Blob[]>([]);
  const last = useRef<number | null>(null);

  useEffect(() => {
    let raf = 0;
    const step = (t: number) => {
      if (last.current !== null && box.current) box.current.scrollTop += ((t - last.current) / 1000) * speed;
      last.current = t;
      raf = requestAnimationFrame(step);
    };
    if (playing) raf = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(raf); last.current = null; };
  }, [playing, speed]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") close(); if (e.key === " ") { e.preventDefault(); setPlaying((p) => !p); } };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

  async function toggleRec() {
    setRecErr("");
    if (rec) { rec.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"].find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
      const r = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      chunks.current = [];
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks.current, { type: r.mimeType });
        download(`voiceover-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.${r.mimeType.includes("mp4") ? "m4a" : "webm"}`, blob);
        setRec(null);
      };
      r.start();
      setRec(r);
      if (box.current) box.current.scrollTop = 0;
      setPlaying(true);
    } catch {
      setRecErr("Microphone permission was blocked. Allow it in your browser settings to record.");
    }
  }

  function close() { rec?.stop(); onClose(); }

  return (
    <div className="fixed inset-0 z-[70] bg-black flex flex-col" role="dialog" aria-label="Teleprompter">
      <div ref={box} onClick={() => setPlaying((p) => !p)} className="flex-1 min-h-0 overflow-y-auto px-6 sm:px-16">
        <div style={{ height: "36dvh" }} aria-hidden="true" />
        <p className={cx("font-display font-semibold leading-snug whitespace-pre-wrap max-w-3xl mx-auto")} style={{ fontSize: size, transform: mirror ? "scaleX(-1)" : undefined }} data-testid="prompter-text">{text}</p>
        <div style={{ height: "60dvh" }} aria-hidden="true" />
      </div>
      <div className="pointer-events-none fixed left-0 right-0 top-[38dvh] h-0.5 bg-teal/40" aria-hidden="true" />
      <div className="border-t border-line bg-ink p-3 flex flex-wrap items-center gap-3" style={{ paddingBottom: "calc(0.75rem + var(--safe-bottom))" }}>
        <button className="btn-primary !min-w-[52px]" onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pause" : "Play"}><Icon name={playing ? "pause" : "play"} /></button>
        <button className={cx("btn-ghost", rec && "!border-bad !text-bad")} onClick={toggleRec}><Icon name="mic" size={18} />{rec ? "Stop & save" : "Record voice"}</button>
        <label className="flex items-center gap-2 text-sm text-mute">Size<input type="range" min={24} max={80} value={size} onChange={(e) => setSize(+e.target.value)} className="accent-[#19D3C5] w-24" /></label>
        <label className="flex items-center gap-2 text-sm text-mute">Speed<input type="range" min={10} max={140} value={speed} onChange={(e) => setSpeed(+e.target.value)} className="accent-[#19D3C5] w-24" /></label>
        <button className="btn-quiet text-sm" onClick={() => setMirror((m) => !m)} aria-pressed={mirror}>Mirror</button>
        <button className="btn-ghost ml-auto" onClick={close}>Done</button>
        {recErr && <p className="w-full text-sm text-[#ffb3b3]">{recErr}</p>}
      </div>
    </div>
  );
}
