"use client";
import { useEffect, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { Icon } from "@/components/icons";
import { MemoryPanel } from "@/components/MemoryPanel";
import { Field, PageHeader, Toggle } from "@/components/ui";
import { blankBrand } from "@/lib/defaultBrand";
import { COMMON_TZS } from "@/lib/time";
import type { BrandProfile, CapabilityStatus } from "@/lib/types";
import { OBJECTIVES, PLATFORMS, PLATFORM_LABEL, TONES } from "@/lib/types";

const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

export default function BrandPage() {
  const { brand, brands, saveBrand, setActiveBrand, removeBrand, toast } = useApp();
  const [b, setB] = useState<BrandProfile | null>(brand);
  const [dirty, setDirty] = useState(false);
  useEffect(() => { setB(brand); setDirty(false); }, [brand]);
  if (!b) return null;
  const set = (patch: Partial<BrandProfile>) => { setB({ ...b, ...patch }); setDirty(true); };

  return (
    <div className="max-w-3xl mx-auto">
      <PageHeader title="Brand profile" sub="Everything here shapes your scripts, captions and recommendations. Each brand keeps its own projects and media."
        action={<button className="btn-ghost" onClick={async () => { const nb = blankBrand(); await saveBrand(nb); setActiveBrand(nb.id); toast("New brand created."); }}><Icon name="plus" size={18} />Add brand</button>} />

      <form className="flex flex-col gap-8" onSubmit={async (e) => { e.preventDefault(); await saveBrand(b); setDirty(false); toast("Brand profile saved."); }}>
        <Group title="Business">
          <Field label="Brand or creator name"><input className="field" value={b.name} onChange={(e) => set({ name: e.target.value })} required /></Field>
          <Field label="Niche or industry"><textarea className="field min-h-[64px]" value={b.niche} onChange={(e) => set({ niche: e.target.value })} /></Field>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Website"><input className="field" type="url" value={b.website} onChange={(e) => set({ website: e.target.value })} /></Field>
            <Field label="Location"><input className="field" value={b.location} onChange={(e) => set({ location: e.target.value })} /></Field>
          </div>
          <Field label="Products and services" hint="One per line."><textarea className="field min-h-[160px]" value={b.products.join("\n")} onChange={(e) => set({ products: lines(e.target.value) })} /></Field>
          <Field label="Equipment" hint="One per line."><textarea className="field min-h-[80px]" value={b.equipment.join("\n")} onChange={(e) => set({ equipment: lines(e.target.value) })} /></Field>
          <div>
            <span className="label">Capabilities</span>
            <p className="text-xs text-mute mb-2">Only capabilities marked tested or available are presented as things you can make.</p>
            <ul className="flex flex-col gap-2">
              {b.capabilities.map((c, i) => (
                <li key={i} className="flex gap-2">
                  <input className="field text-sm" value={c.name} aria-label="Capability" onChange={(e) => set({ capabilities: b.capabilities.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)) })} />
                  <select className="field !w-40 text-sm" value={c.status} aria-label="Status" onChange={(e) => set({ capabilities: b.capabilities.map((x, k) => (k === i ? { ...x, status: e.target.value as CapabilityStatus } : x)) })}>
                    <option value="tested">Tested</option><option value="available">Available</option><option value="experimental">Experimental</option><option value="unavailable">Unavailable</option>
                  </select>
                  <button type="button" className="btn-quiet" aria-label="Remove capability" onClick={() => set({ capabilities: b.capabilities.filter((_, k) => k !== i) })}><Icon name="x" size={16} /></button>
                </li>
              ))}
            </ul>
            <button type="button" className="btn-quiet text-sm mt-1" onClick={() => set({ capabilities: [...b.capabilities, { name: "", status: "available" }] })}><Icon name="plus" size={16} />Add capability</button>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Main sales channels"><input className="field" value={b.salesChannels} onChange={(e) => set({ salesChannels: e.target.value })} /></Field>
            <Field label="Pricing (optional)" hint="Only used if you fill it in."><input className="field" value={b.pricing} onChange={(e) => set({ pricing: e.target.value })} /></Field>
          </div>
        </Group>

        <Group title="Audience">
          <Field label="Target audience"><textarea className="field min-h-[64px]" value={b.targetAudience} onChange={(e) => set({ targetAudience: e.target.value })} /></Field>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Countries and cities"><input className="field" value={b.audienceLocations} onChange={(e) => set({ audienceLocations: e.target.value })} /></Field>
            <Field label="Languages"><input className="field" value={b.languages} onChange={(e) => set({ languages: e.target.value })} /></Field>
          </div>
          <Field label="Why customers buy"><textarea className="field min-h-[64px]" value={b.buyingMotivations} onChange={(e) => set({ buyingMotivations: e.target.value })} /></Field>
        </Group>

        <Group title="Accounts and time zones">
          {PLATFORMS.map((p) => (
            <div key={p} className="grid grid-cols-[100px_1fr_1fr] gap-2 items-center">
              <span className="text-sm">{PLATFORM_LABEL[p]}</span>
              <input className="field text-sm" value={b.handles[p]} aria-label={`${PLATFORM_LABEL[p]} handle`} onChange={(e) => set({ handles: { ...b.handles, [p]: e.target.value } })} />
              <select className="field text-sm" value={b.accountTypes[p]} aria-label={`${PLATFORM_LABEL[p]} account type`} onChange={(e) => set({ accountTypes: { ...b.accountTypes, [p]: e.target.value } })}>
                {(p === "facebook" ? ["Page", "Personal profile"] : ["Business", "Creator", "Personal"]).map((x) => <option key={x}>{x}</option>)}
              </select>
            </div>
          ))}
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Your time zone (for scheduling)">
              <select className="field" value={b.creatorTimezone} onChange={(e) => set({ creatorTimezone: e.target.value })}>{COMMON_TZS.map((z) => <option key={z}>{z}</option>)}</select>
            </Field>
            <Field label="Platform account time zone">
              <select className="field" value={b.platformTimezones.instagram} onChange={(e) => set({ platformTimezones: { tiktok: e.target.value, instagram: e.target.value, facebook: e.target.value } })}>{COMMON_TZS.map((z) => <option key={z}>{z}</option>)}</select>
            </Field>
          </div>
          <Field label="Audience time zones" hint="The first one is your main audience. Posting times are aimed at it.">
            <div className="flex flex-wrap gap-1.5">
              {COMMON_TZS.map((z) => {
                const on = b.audienceTimezones.includes(z);
                return <button type="button" key={z} className={`chip text-xs ${on ? "chip-on" : ""}`} aria-pressed={on}
                  onClick={() => set({ audienceTimezones: on ? b.audienceTimezones.filter((x) => x !== z) : [...b.audienceTimezones, z] })}>{z.split("/")[1].replace(/_/g, " ")}</button>;
              })}
            </div>
          </Field>
        </Group>

        <Group title="Voice and content">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Primary goal"><select className="field" value={b.objective} onChange={(e) => set({ objective: e.target.value as BrandProfile["objective"] })}>{OBJECTIVES.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></Field>
            <Field label="Tone"><select className="field" value={b.tone} onChange={(e) => set({ tone: e.target.value as BrandProfile["tone"] })}>{TONES.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></Field>
          </div>
          {b.tone === "custom" && <Field label="Describe your tone"><input className="field" value={b.customTone} onChange={(e) => set({ customTone: e.target.value })} /></Field>}
          <Field label="Calls to action" hint="One per line. These are offered in every package."><textarea className="field min-h-[150px]" value={b.ctas.join("\n")} onChange={(e) => set({ ctas: lines(e.target.value) })} /></Field>
          <Field label="Brand vocabulary"><input className="field" value={b.vocabulary} onChange={(e) => set({ vocabulary: e.target.value })} /></Field>
          <Field label="Topics and claims to avoid"><textarea className="field min-h-[64px]" value={b.avoid} onChange={(e) => set({ avoid: e.target.value })} /></Field>
          <Field label="This content is">
            <select className="field" value={b.contentUse} onChange={(e) => set({ contentUse: e.target.value as BrandProfile["contentUse"] })}>
              <option value="personal">Personal</option><option value="commercial">Commercial (business account)</option><option value="sponsored">Sponsored</option><option value="paid_ad">Paid advertisement</option>
            </select>
          </Field>
          <div className="grid sm:grid-cols-2 gap-x-4">
            <Toggle checked={b.onCamera} onChange={(v) => set({ onCamera: v })} label="I appear on camera" />
            <Toggle checked={b.formatPrefs.voiceover} onChange={(v) => set({ formatPrefs: { ...b.formatPrefs, voiceover: v } })} label="Voiceovers" />
            <Toggle checked={b.formatPrefs.captions} onChange={(v) => set({ formatPrefs: { ...b.formatPrefs, captions: v } })} label="On-screen captions" />
            <Toggle checked={b.formatPrefs.music} onChange={(v) => set({ formatPrefs: { ...b.formatPrefs, music: v } })} label="Music" />
            <Toggle checked={b.formatPrefs.textOnly} onChange={(v) => set({ formatPrefs: { ...b.formatPrefs, textOnly: v } })} label="Text-only videos" />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Music styles you like"><input className="field" value={b.musicStyles} onChange={(e) => set({ musicStyles: e.target.value })} /></Field>
            <Field label="Music to avoid"><input className="field" value={b.excludedMusic} onChange={(e) => set({ excludedMusic: e.target.value })} /></Field>
          </div>
        </Group>

        <Group title="Look">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {(["primary", "secondary", "accent", "detail"] as const).map((k) => (
              <label key={k} className="text-sm"><span className="label capitalize">{k}</span>
                <input type="color" className="h-11 w-full rounded-lg bg-ink border border-line" value={b.colors[k]} onChange={(e) => set({ colors: { ...b.colors, [k]: e.target.value } })} />
              </label>
            ))}
          </div>
          <Field label="Logo">
            <div className="flex items-center gap-3">
              {b.logoDataUrl && <img src={b.logoDataUrl} alt="Logo" className="h-12 w-12 rounded object-contain bg-ink border border-line" />}
              <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="text-sm" onChange={(e) => {
                const f = e.target.files?.[0]; if (!f) return;
                if (f.size > 1024 * 1024) { toast("Logo must be under 1 MB.", "error"); return; }
                const r = new FileReader(); r.onload = () => set({ logoDataUrl: String(r.result) }); r.readAsDataURL(f);
              }} />
            </div>
          </Field>
        </Group>

        <Group title="Preferred versions">
          <p className="text-sm text-mute">Scripts you save as “preferred” teach the writer your voice. Generated scripts are never used unless you save them.</p>
          {b.approvedExamples.length === 0 ? <p className="text-sm text-mute">None yet.</p> : (
            <ul className="flex flex-col gap-2">{b.approvedExamples.map((x, i) => (
              <li key={i} className="flex gap-2 text-sm panel p-2.5 approved"><span className="flex-1">{x}</span>
                <button type="button" className="btn-quiet !min-h-[28px]" aria-label="Remove example" onClick={() => set({ approvedExamples: b.approvedExamples.filter((_, k) => k !== i) })}><Icon name="x" size={14} /></button></li>
            ))}</ul>
          )}
        </Group>

        <div className="sticky bottom-[calc(80px+var(--safe-bottom))] lg:bottom-4 flex gap-2 bg-black/90 backdrop-blur py-3 -mx-1 px-1">
          <button className="btn-primary flex-1 sm:flex-none" disabled={!dirty} data-testid="save-brand">{dirty ? "Save brand profile" : "Saved"}</button>
          {brands.length > 1 && (
            <button type="button" className="btn-ghost text-bad" onClick={async () => {
              if (!confirm(`Delete ${b.name} with all its projects and media? This can't be undone.`)) return;
              await removeBrand(b.id); toast("Brand deleted.");
            }}>Delete brand</button>
          )}
        </div>
      </form>
      <MemoryPanel />
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="text-xl font-bold mb-3">{title}</legend>
      {children}
    </fieldset>
  );
}
