"use client";
import { useEffect, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { Icon } from "@/components/icons";
import { StatusPage } from "@/components/StatusPage";
import { Notice } from "@/components/ui";

interface SavedLink { url: string; note: string; addedAt: string }
const key = (brandId: string) => `cp.trendLinks.${brandId}`;

export default function Trending() {
  const { brand } = useApp();
  const [links, setLinks] = useState<SavedLink[]>([]);
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  useEffect(() => { if (brand) try { setLinks(JSON.parse(localStorage.getItem(key(brand.id)) || "[]")); } catch { /* storage unavailable */ } }, [brand]);
  if (!brand) return null;
  const save = (l: SavedLink[]) => { setLinks(l); try { localStorage.setItem(key(brand.id), JSON.stringify(l)); } catch { /* ignore */ } };
  return (
    <StatusPage title="Trending now" status="Requires Credentials"
      intro="ContentPilot only shows trends it can back with a source and a date. No verified trend source is connected, so nothing here is ranked or scored."
      needs={["An approved trend data provider, or TikTok/Meta account insights after app review (Phase 2).", "Public sites like TikTok Creative Center don't offer an API for this; they won't be scraped."]}
      now={<>
        <p>Browse trends yourself in the official tools, then paste anything relevant below to keep it with this brand.</p>
        <div className="flex flex-wrap gap-2">
          <a className="btn-ghost text-sm" href="https://ads.tiktok.com/business/creativecenter/inspiration/popular/hashtag/pc/en" target="_blank" rel="noreferrer"><Icon name="external" size={16} />TikTok Creative Center</a>
          <a className="btn-ghost text-sm" href="https://ads.tiktok.com/business/creativecenter/music/pc/en" target="_blank" rel="noreferrer"><Icon name="external" size={16} />TikTok Commercial Music</a>
        </div>
      </>}>
      <Notice kind="warn">Current trend verification is unavailable. You can continue with general recommendations or provide a trend link for analysis.</Notice>
      <form className="panel p-4 mt-4 flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); if (!/^https?:\/\//.test(url)) return; save([{ url, note, addedAt: new Date().toISOString() }, ...links]); setUrl(""); setNote(""); }}>
        <label className="label" htmlFor="tl">Paste a trend link</label>
        <input id="tl" className="field" type="url" placeholder="https://www.tiktok.com/…" value={url} onChange={(e) => setUrl(e.target.value)} />
        <input className="field" placeholder="Why it's relevant (optional)" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Note" />
        <button className="btn-primary self-start">Save trend</button>
      </form>
      {links.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2">
          {links.map((l, i) => (
            <li key={i} className="panel p-3 text-sm">
              <a href={l.url} target="_blank" rel="noreferrer" className="text-teal break-all">{l.url}</a>
              {l.note && <div>{l.note}</div>}
              <div className="text-xs text-mute mt-1">Saved {new Date(l.addedAt).toLocaleString()} · Your link — popularity not verified
                <button className="ml-2 underline" onClick={() => save(links.filter((_, k) => k !== i))}>Remove</button></div>
            </li>
          ))}
        </ul>
      )}
    </StatusPage>
  );
}
