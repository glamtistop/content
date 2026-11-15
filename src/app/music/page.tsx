"use client";
import { useApp } from "@/components/AppProvider";
import { Icon } from "@/components/icons";
import { StatusPage } from "@/components/StatusPage";
import { Notice } from "@/components/ui";

const ALTS = [
  { t: "No music / original sound", d: "Best when your process sounds are satisfying or you're talking." },
  { t: "Voiceover + instrumental", d: "Keep the instrumental low; your words carry the sale." },
  { t: "Upload original music", d: "Only music you own or have written permission to use. Added in the editor (Phase 3)." },
  { t: "Licensed music library", d: "TikTok Commercial Music Library or Meta Sound Collection for business accounts." },
  { t: "Suggested music style", d: "Each package suggests a style to search for in the app." },
];

export default function Music() {
  const { brand } = useApp();
  if (!brand) return null;
  const commercial = brand.contentUse !== "personal";
  return (
    <StatusPage title="Music & sounds" status="Requires Platform Approval"
      intro="No current song rankings are shown, because none can be verified here. Packages suggest a music style, and you pick the track inside each app."
      needs={["Commercial music catalogs aren't available through a public API. A licensed music provider or official platform integration is needed (Phase 2).", "A license on one platform doesn't carry over to another — each is checked separately."]}
      now={<>
        <div className="flex flex-wrap gap-2">
          <a className="btn-ghost text-sm" href="https://ads.tiktok.com/business/creativecenter/music/pc/en" target="_blank" rel="noreferrer"><Icon name="external" size={16} />TikTok Commercial Music Library</a>
          <a className="btn-ghost text-sm" href="https://www.facebook.com/sound/collection/" target="_blank" rel="noreferrer"><Icon name="external" size={16} />Meta Sound Collection</a>
        </div>
        <p>Your styles: {brand.musicStyles || "not set"}{brand.excludedMusic ? `. Avoiding: ${brand.excludedMusic}` : ""}.</p>
      </>}>
      <Notice kind="warn">
        {commercial
          ? `${brand.name} is set up as commercial content. Popular songs in the general library are often not cleared for business use. Check availability and usage rights in the platform before posting.`
          : "Check availability and usage rights in the platform before posting."}
      </Notice>
      <h2 className="font-semibold mt-6 mb-2">Audio options</h2>
      <ul className="grid sm:grid-cols-2 gap-2">
        {ALTS.map((a) => <li key={a.t} className="panel p-3"><div className="font-medium">{a.t}</div><div className="text-sm text-mute">{a.d}</div></li>)}
      </ul>
      <p className="text-sm text-mute mt-4">When a platform track can't be attached from here: export your video without it, note the track, and add it in the app. That step stays marked as not done until you do it.</p>
    </StatusPage>
  );
}
