"use client";
import { useState } from "react";
import { download, fullPackageText, packageText, planMarkdown, safeName, shotListCsv, subtitles } from "@/lib/export";
import { improvePlan, reviewPlan, RUBRIC } from "@/lib/generate/review";
import { sectionLabel } from "@/lib/generate/sections";
import { RULES, validateCaption } from "@/lib/platforms";
import { postRightNow } from "@/lib/time";
import type { HashtagRec, Platform, SectionKey, Version } from "@/lib/types";
import { EVIDENCE_LABEL, PLATFORM_LABEL } from "@/lib/types";
import { useApp } from "../AppProvider";
import { Icon } from "../icons";
import { CopyButton, EvidenceBadge, Modal, Notice, cx } from "../ui";
import { LockChip } from "./CenterPanel";
import { CoverDesigner } from "./Cover";
import type { ProjectApi } from "./useProject";

export function Readiness({ api }: { api: ProjectApi }) {
  const { project: p, update, assets } = api;
  const { toast } = useApp();
  const [rubric, setRubric] = useState(false);
  if (!p?.plan) return null;
  const r = p.review ?? reviewPlan(p.plan, p, assets);
  return (
    <section className="panel p-4" aria-labelledby="ready-h">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="ready-h" className="font-semibold">Creative readiness</h2>
          <button className="text-xs text-teal underline" onClick={() => setRubric(true)}>How this is scored</button>
        </div>
        <div className="text-right">
          <div className="font-display text-4xl font-extrabold leading-none" data-testid="score">{r.score}<span className="text-lg text-mute">/100</span></div>
        </div>
      </div>
      <p className="text-xs text-mute mt-1">A checklist of craft basics — not a platform score or a prediction of views or sales.</p>
      <div className="grid grid-cols-2 gap-2 mt-3 text-sm">
        <div className="rounded-lg border border-line p-2.5"><div className="text-mute text-xs">Reach opportunity</div><div className="font-semibold">{r.reach.level}</div><div className="text-xs text-mute mt-0.5">{r.reach.why}</div></div>
        <div className="rounded-lg border border-line p-2.5"><div className="text-mute text-xs">Sales opportunity</div><div className="font-semibold">{r.sales.level}</div><div className="text-xs text-mute mt-0.5">{r.sales.why}</div></div>
      </div>
      {r.rejected.length > 0 && <div className="mt-3"><Notice kind="warn">{r.rejected.map((x) => <div key={x}>{x}</div>)}</Notice></div>}
      {r.suggestions.length > 0 && (
        <ul className="mt-3 text-sm flex flex-col gap-1.5">{r.suggestions.map((s) => <li key={s} className="flex gap-2"><Icon name="wand" size={16} className="text-teal shrink-0 mt-0.5" />{s}</li>)}</ul>
      )}
      <button className="btn-ghost w-full mt-3" data-testid="improve" onClick={async () => {
        await api.snapshot("Before Improve my post");
        const res = improvePlan(p.plan!, p);
        update((x) => { x.plan = res.plan; x.review = reviewPlan(res.plan, x, assets); return x; }, true);
        toast(res.changes.length ? res.changes.join(" ") : res.skipped.length ? res.skipped.join(" ") : "Nothing to fix automatically — see the suggestions.");
      }}><Icon name="wand" size={16} />Improve my post</button>
      <Modal open={rubric} onClose={() => setRubric(false)} title="Creative readiness — scoring rubric">
        <ul className="flex flex-col gap-2 text-sm">
          {RUBRIC.map((x) => {
            const c = r.checks.find((y) => y.id === x.id);
            return <li key={x.id} className="flex gap-3"><span className="w-14 shrink-0 text-right font-semibold">{c?.points ?? 0}/{x.max}</span><span><b>{x.label}.</b> {x.rule}</span></li>;
          })}
        </ul>
        <p className="text-xs text-mute mt-3">These rules check craft and accuracy. No score can predict how a platform will distribute a post.</p>
      </Modal>
    </section>
  );
}

export function Packages({ api }: { api: ProjectApi }) {
  const { project: p, editSection, runSection, update, busy } = api;
  const { brand } = useApp();
  const [tab, setTab] = useState<Platform>(p?.platforms[0] ?? "tiktok");
  const [newTag, setNewTag] = useState("");
  if (!p?.plan || !brand) return null;
  const platforms = p.platforms;
  const active = platforms.includes(tab) ? tab : platforms[0];
  const pkg = p.plan.packages[active];
  const k = (f: string) => `pkg.${active}.${f}` as SectionKey;
  const setPkg = (key: SectionKey, patch: Partial<typeof pkg>) => editSection(key, (pl) => ({ ...pl, packages: { ...pl.packages, [active]: { ...pl.packages[active], ...patch } } }));
  const v = validateCaption(active, pkg.caption, pkg.hashtags.map((h) => h.tag));
  const now = postRightNow(active, { creatorTz: brand.creatorTimezone, audienceTzs: brand.audienceTimezones, objective: p.objective });
  const approvedAll = (["caption", "hashtags", "cta"] as const).every((f) => p.locked[k(f)] === "approved");

  return (
    <section aria-labelledby="pkg-h" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 id="pkg-h" className="text-xl font-bold">Posting packages</h2>
        <CopyButton label="Copy all" testid="copy-all" text={() => platforms.map((pl) => fullPackageText(p.plan!.packages[pl])).join("\n\n————————\n\n")} />
      </div>
      <div className="grid grid-cols-3 gap-1 rounded-lg bg-ink border border-line p-1" role="tablist" aria-label="Platform">
        {platforms.map((pl) => (
          <button key={pl} role="tab" aria-selected={pl === active} onClick={() => setTab(pl)} data-testid={`tab-${pl}`}
            className={cx("rounded-md min-h-[40px] text-sm font-medium", pl === active ? "bg-graphite text-paper" : "text-mute")}>{PLATFORM_LABEL[pl]}</button>
        ))}
      </div>

      <div className={cx("panel p-4 flex flex-col gap-4", approvedAll && "approved")} role="tabpanel" data-testid={`pkg-${active}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="font-semibold">{pkg.postType}</div>
            <div className="text-sm text-mute">{pkg.angle}{pkg.durationSec ? ` · ${pkg.durationSec}s` : ""}</div>
          </div>
          <CopyButton label={`Copy ${PLATFORM_LABEL[active]} package`} text={() => fullPackageText(pkg)} testid={`copy-pkg-${active}`} />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="label !mb-0">Hook</span>
          </div>
          <p className="text-[15px]">“{pkg.hook}”</p>
        </div>

        <div>
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="label !mb-0">Caption</span>
            <div className="flex gap-1 items-center">
              <LockChip state={p.locked[k("caption")]} />
              <button className="btn-quiet !min-h-[32px] text-sm" disabled={!!busy} onClick={() => runSection({ section: k("caption"), label: `New ${PLATFORM_LABEL[active]} caption` })} aria-label="Regenerate caption"><Icon name="refresh" size={16} /></button>
              <CopyButton text={() => packageText(pkg)} label="Copy caption + tags" testid={`copy-caption-${active}`} />
            </div>
          </div>
          <textarea className="field text-sm min-h-[130px]" value={pkg.caption} data-testid={`caption-${active}`}
            onChange={(e) => setPkg(k("caption"), { caption: e.target.value })} />
          <div className={cx("text-xs mt-1", v.ok ? "text-mute" : "text-warn")}>{v.length}/{RULES[active].captionMax} characters with hashtags{v.issues.length ? ` · ${v.issues.join(" ")}` : ""}</div>
          <label className="block mt-2"><span className="text-xs text-mute">Short alternative</span>
            <input className="field text-sm" value={pkg.shortCaption} onChange={(e) => setPkg(k("caption"), { shortCaption: e.target.value })} />
          </label>
        </div>

        <div>
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="label !mb-0">Hashtags</span>
            <div className="flex gap-1 items-center">
              <LockChip state={p.locked[k("hashtags")]} />
              <button className="btn-quiet !min-h-[32px] text-sm" disabled={!!busy} onClick={() => runSection({ section: k("hashtags"), label: "Regenerating hashtags" })}>Regenerate hashtags</button>
              <CopyButton text={pkg.hashtags.map((h) => h.tag).join(" ")} label="Copy hashtags" />
            </div>
          </div>
          <ul className="flex flex-col gap-1.5">
            {pkg.hashtags.map((h: HashtagRec) => (
              <li key={h.tag} className="text-sm rounded-lg border border-line p-2 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-medium text-teal break-all min-w-0 flex-1">{h.tag}</span>
                  <EvidenceBadge e={h.evidence} />
                  <button className="btn-quiet !min-h-[28px] !px-1 shrink-0" aria-label={`Remove ${h.tag}`} onClick={() => setPkg(k("hashtags"), { hashtags: pkg.hashtags.filter((x) => x.tag !== h.tag) })}><Icon name="x" size={14} /></button>
                </div>
                <div className="text-mute mt-0.5">{h.purpose}</div>
              </li>
            ))}
          </ul>
          <form className="flex gap-2 mt-2" onSubmit={(e) => { e.preventDefault(); const t = newTag.trim().replace(/\s+/g, ""); if (!t) return; setPkg(k("hashtags"), { hashtags: [...pkg.hashtags, { tag: t.startsWith("#") ? t : "#" + t, purpose: "Added by you.", evidence: "inferred" }] }); setNewTag(""); }}>
            <input className="field !py-1.5 text-sm" placeholder="Add a hashtag" value={newTag} onChange={(e) => setNewTag(e.target.value)} aria-label="Add a hashtag" />
            <button className="btn-ghost !min-h-[38px] text-sm">Add</button>
          </form>
          <p className="text-xs text-mute mt-1">{RULES[active].hashtagGuidance} No verified trend data is connected, so tags are chosen for relevance, not popularity.</p>
        </div>

        <div>
          <span className="label">Search phrases</span>
          <div className="flex flex-wrap gap-1.5">{pkg.searchPhrases.map((s) => <span key={s} className="rounded-full border border-line px-2.5 py-1 text-xs">{s}</span>)}</div>
          <p className="text-xs text-mute mt-1">Use these naturally in your spoken words, on-screen text and caption.</p>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <label><span className="label">Cover headline</span>
            <input className="field text-sm" value={pkg.coverHeadline} onChange={(e) => setPkg(k("coverHeadline"), { coverHeadline: e.target.value })} />
          </label>
          <label><span className="label">Call to action</span>
            <select className="field text-sm" value={brand.ctas.includes(pkg.cta) ? pkg.cta : "__custom"} onChange={(e) => e.target.value !== "__custom" && setPkg(k("cta"), { cta: e.target.value })}>
              {brand.ctas.map((c) => <option key={c}>{c}</option>)}
              {!brand.ctas.includes(pkg.cta) && <option value="__custom">{pkg.cta}</option>}
            </select>
          </label>
        </div>

        {pkg.onScreenText.length > 0 && (
          <div>
            <span className="label">On-screen text</span>
            <ol className="list-decimal pl-5 text-sm">{pkg.onScreenText.map((t, i) => <li key={i}>{t}</li>)}</ol>
          </div>
        )}

        <div>
          <div className="flex items-center gap-2 mb-1"><span className="label !mb-0">Audio</span><EvidenceBadge e={pkg.audio.evidence} /></div>
          <p className="text-sm">{pkg.audio.suggestion}</p>
          {pkg.audio.rightsNote && <p className="text-sm text-warn mt-1">{pkg.audio.rightsNote}</p>}
        </div>

        <div>
          <span className="label">When to post</span>
          <ul className="flex flex-col gap-1.5">
            {pkg.postingWindows.map((w) => (
              <li key={w.rank} className="rounded-lg border border-line p-2.5 text-sm">
                <div className="flex flex-wrap items-center gap-2 justify-between">
                  <span><b>{w.rank === "best" ? "Best" : w.rank === "second" ? "Second best" : "Test"}:</b> {w.label}</span>
                  <EvidenceBadge e={w.evidence} />
                </div>
                <div className="text-mute text-xs mt-1">{w.why} Confidence: {w.confidence}. {w.dataNote}</div>
              </li>
            ))}
          </ul>
          <div className="rounded-lg border border-teal/30 p-2.5 text-sm mt-2">
            <b>Post right now?</b> {now.headline} <span className="text-mute">{now.explanation}</span>
          </div>
        </div>

        <p className="text-sm text-mute"><b className="text-paper">Why it's written this way:</b> {pkg.explanation}</p>

        <div>
          <span className="label">To publish</span>
          <ol className="list-decimal pl-5 text-sm flex flex-col gap-0.5">{pkg.workflow.map((w) => <li key={w}>{w}</li>)}</ol>
          <p className="text-xs text-mute mt-1">Direct publishing needs {RULES[active].publishing.requires.join(", ")}. {RULES[active].publishing.note}</p>
        </div>

        <button className={cx("btn w-full", approvedAll ? "border border-gold/60 text-gold" : "btn-ghost")} data-testid={`approve-${active}`}
          onClick={() => { if (!approvedAll) void api.recordDecision([{ kind: "approve", field: "caption", platform: active, before: "", after: pkg.caption }]); update((x) => {
            for (const f of ["caption", "hashtags", "cta", "coverHeadline"] as const) {
              const key = `pkg.${active}.${f}` as SectionKey;
              if (approvedAll) delete x.locked[key]; else x.locked[key] = "approved";
            }
            const all = x.platforms.every((pl) => x.locked[`pkg.${pl}.caption`] === "approved");
            x.stage = all ? "approved" : "ready";
            return x;
          }, true); }}>
          <Icon name="check" size={16} />{approvedAll ? `${PLATFORM_LABEL[active]} approved — tap to unapprove` : `Approve ${PLATFORM_LABEL[active]} copy`}
        </button>
      </div>
    </section>
  );
}

export function ExportCenter({ api }: { api: ProjectApi }) {
  const { project: p, assets } = api;
  const { brand } = useApp();
  const [cover, setCover] = useState(false);
  if (!p?.plan || !brand) return null;
  const base = safeName(p.name);
  const isVideo = p.singlePictureMode !== "photo";
  return (
    <section className="panel p-4" aria-labelledby="exp-h">
      <h2 id="exp-h" className="font-semibold mb-3">Export</h2>
      <div className="grid grid-cols-1 gap-2">
        <button className="btn-ghost justify-start text-sm" data-testid="export-md" onClick={() => download(`${base}-plan.md`, planMarkdown(p.plan!, p, brand), "text/markdown")}><Icon name="download" size={16} />Complete content plan (.md)</button>
        <button className="btn-ghost justify-start text-sm" onClick={() => printPlan(planMarkdown(p.plan!, p, brand))}><Icon name="download" size={16} />Print or save as PDF</button>
        {p.platforms.map((pl) => (
          <button key={pl} className="btn-ghost justify-start text-sm" onClick={() => download(`${base}-${pl}.txt`, fullPackageText(p.plan!.packages[pl]))}><Icon name="download" size={16} />{PLATFORM_LABEL[pl]} package (.txt)</button>
        ))}
        {isVideo && <>
          <button className="btn-ghost justify-start text-sm" onClick={() => download(`${base}-shot-list.csv`, shotListCsv(p.plan!), "text/csv")}><Icon name="download" size={16} />Shot list & editing instructions (.csv)</button>
          <button className="btn-ghost justify-start text-sm" data-testid="export-srt" onClick={() => download(`${base}.srt`, subtitles(p.plan!, p.speakingRateWpm, "srt"))}><Icon name="download" size={16} />Subtitles (.srt, estimated timing)</button>
          <button className="btn-ghost justify-start text-sm" onClick={() => download(`${base}.vtt`, subtitles(p.plan!, p.speakingRateWpm, "vtt"), "text/vtt")}><Icon name="download" size={16} />Subtitles (.vtt, estimated timing)</button>
        </>}
        {p.plan.photo && <button className="btn-ghost justify-start text-sm" onClick={() => download(`${base}-alt-text.txt`, p.plan!.photo!.altText)}><Icon name="download" size={16} />Alt text (.txt)</button>}
        <button className="btn-ghost justify-start text-sm" disabled={!assets.length} onClick={() => setCover(true)} data-testid="open-cover"><Icon name="image" size={16} />Design & export cover (PNG)</button>
      </div>
      <p className="text-xs text-mute mt-3">{isVideo ? "No video file is produced yet — these exports are your script, shot list and storyboard. MP4 rendering arrives in Phase 3." : "Picture posts are ready to copy and post as-is."}</p>
      {cover && <CoverDesigner api={api} onClose={() => setCover(false)} />}
    </section>
  );
}

function printPlan(md: string) {
  const w = window.open("", "_blank");
  if (!w) return;
  const esc = md.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  w.document.write(`<!doctype html><title>Content plan</title><style>body{font:14px/1.55 -apple-system,system-ui,sans-serif;max-width:720px;margin:40px auto;padding:0 20px;white-space:pre-wrap;color:#111}</style><body>${esc}</body>`);
  w.document.close();
  w.focus();
  w.print();
}

export function Versions({ api }: { api: ProjectApi }) {
  const { versions, project: p, restore } = api;
  const [cmp, setCmp] = useState<Version | null>(null);
  if (!p?.plan) return null;
  const locked = Object.entries(p.locked).filter(([, v]) => v) as [SectionKey, string][];
  return (
    <section className="panel p-4" aria-labelledby="ver-h">
      <h2 id="ver-h" className="font-semibold mb-2">Versions</h2>
      {locked.length > 0 && (
        <div className="text-xs text-mute mb-3">
          Protected from regeneration: {locked.map(([k, v]) => <span key={k} className={cx("inline-block mr-1.5", v === "approved" ? "text-gold" : "")}>{sectionLabel(k)}{v === "approved" ? " (approved)" : ""}</span>)}
          <button className="text-teal underline ml-1" onClick={() => api.update((x) => ({ ...x, locked: {} }), true)}>Unlock all</button>
        </div>
      )}
      {versions.length === 0 ? <p className="text-sm text-mute">Versions are saved automatically each time content is generated or rewritten.</p> : (
        <ul className="flex flex-col gap-1.5 max-h-72 overflow-y-auto scrollbar-thin">
          {versions.map((v) => (
            <li key={v.id} className="flex items-center gap-2 text-sm">
              <span className="flex-1 min-w-0 truncate">{v.label} <span className="text-mute">· {new Date(v.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span></span>
              <button className="btn-quiet !min-h-[32px] text-sm" onClick={() => setCmp(v)}>Compare</button>
              <button className="btn-quiet !min-h-[32px] text-sm text-teal" onClick={() => restore(v)}>Restore</button>
            </li>
          ))}
        </ul>
      )}
      <button className="btn-ghost w-full mt-3 text-sm" onClick={() => api.snapshot("Saved by you")}>Save a version now</button>
      <Modal open={!!cmp} onClose={() => setCmp(null)} title="Compare versions" wide>
        {cmp && (
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            {[{ t: `Then: ${cmp.label}`, pl: cmp.plan }, { t: "Now", pl: p.plan }].map(({ t, pl }) => (
              <div key={t}>
                <h3 className="font-semibold mb-2">{t}</h3>
                <p className="text-mute">Hook</p><p className="mb-2">{pl.hooks[pl.recommendedHook.index]?.text}</p>
                <p className="text-mute">Script</p><p className="mb-2 whitespace-pre-wrap">{pl.segments.map((s) => s.spoken).filter(Boolean).join("\n")}</p>
                {p.platforms.map((x) => <div key={x}><p className="text-mute">{PLATFORM_LABEL[x]} caption</p><p className="mb-2 whitespace-pre-wrap">{pl.packages[x].caption}</p></div>)}
              </div>
            ))}
          </div>
        )}
      </Modal>
    </section>
  );
}

export { EVIDENCE_LABEL };
