"use client";
import Link from "next/link";
import { useState } from "react";
import { COMMON_TZS } from "@/lib/time";
import { OBJECTIVES, TONES } from "@/lib/types";
import { useApp } from "./AppProvider";
import { Field, Modal, Toggle } from "./ui";

/** First-use check-in: confirms only what changes the content. Everything else lives in Brand profile. */
export function Onboarding() {
  const { brand, saveBrand } = useApp();
  const [open, setOpen] = useState(true);
  const [b, setB] = useState(brand!);
  const done = async () => { await saveBrand({ ...b, onboarded: true }); setOpen(false); };
  return (
    <Modal open={open} onClose={done} title="Welcome to ContentPilot">
      <p className="text-mute mb-4">Your brand is set up as <b className="text-paper">{b.name}</b> in {b.location}. Check these four things — they shape every post.</p>
      <div className="flex flex-col gap-4">
        <Field label="Main goal">
          <select className="field" value={b.objective} onChange={(e) => setB({ ...b, objective: e.target.value as typeof b.objective })}>
            {OBJECTIVES.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </Field>
        <Field label="Tone">
          <select className="field" value={b.tone} onChange={(e) => setB({ ...b, tone: e.target.value as typeof b.tone })}>
            {TONES.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </Field>
        <Field label="Your time zone">
          <select className="field" value={b.creatorTimezone} onChange={(e) => setB({ ...b, creatorTimezone: e.target.value })}>
            {COMMON_TZS.map((z) => <option key={z}>{z}</option>)}
          </select>
        </Field>
        <Toggle checked={b.onCamera} onChange={(v) => setB({ ...b, onCamera: v })} label="I'm happy to appear on camera" />
      </div>
      <div className="flex flex-wrap gap-2 mt-6">
        <button className="btn-primary flex-1" onClick={done} data-testid="onboard-done">Looks right — start</button>
        <Link className="btn-ghost" href="/brand/" onClick={done}>Edit full profile</Link>
      </div>
    </Modal>
  );
}
