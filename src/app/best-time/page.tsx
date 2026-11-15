"use client";
import { useEffect, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { EvidenceBadge, PageHeader, cx } from "@/components/ui";
import { fmtInTz, isDst, postingWindows, postRightNow, tzAbbrev } from "@/lib/time";
import type { Platform } from "@/lib/types";
import { PLATFORMS, PLATFORM_LABEL } from "@/lib/types";

export default function BestTime() {
  const { brand } = useApp();
  const [now, setNow] = useState(() => new Date());
  const [pl, setPl] = useState<Platform>("tiktok");
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  if (!brand) return null;
  const ctx = { creatorTz: brand.creatorTimezone, audienceTzs: brand.audienceTimezones, objective: brand.objective };
  const advice = postRightNow(pl, ctx, now);

  return (
    <div className="max-w-5xl mx-auto">
      <PageHeader title="When to post" sub="Starting hypotheses until your account data is connected. Post, track results, and these get replaced by what actually works for you." />

      <section className="panel p-5 mb-6 layers">
        <div className="text-mute text-sm">Your time ({brand.creatorTimezone})</div>
        <div className="font-display text-4xl sm:text-5xl font-extrabold tabular-nums" data-testid="clock">{fmtInTz(now, brand.creatorTimezone, { date: false, seconds: true })}</div>
        <div className="text-sm text-mute mt-1">{now.toLocaleDateString("en-US", { timeZone: brand.creatorTimezone, weekday: "long", month: "long", day: "numeric", year: "numeric" })} · {isDst(now, brand.creatorTimezone) ? "Daylight saving time" : "Standard time"} ({tzAbbrev(now, brand.creatorTimezone)})</div>
        {brand.audienceTimezones.filter((z) => z !== brand.creatorTimezone).map((z) => (
          <div key={z} className="text-sm mt-1">Audience in {z.split("/")[1].replace(/_/g, " ")}: {fmtInTz(now, z, { date: false })}</div>
        ))}
      </section>

      <section id="now" className="panel p-5 mb-8" aria-labelledby="prn">
        <h2 id="prn" className="text-2xl font-bold mb-3">Post right now?</h2>
        <div className="flex flex-wrap gap-2 mb-4">
          {PLATFORMS.map((p) => <button key={p} className={cx("chip", pl === p && "chip-on")} onClick={() => setPl(p)}>{PLATFORM_LABEL[p]}</button>)}
        </div>
        <p className={cx("text-lg font-semibold", advice.reasonable ? "text-teal" : "text-warn")} data-testid="post-now-headline">{advice.headline}</p>
        <p className="text-mute mt-1 max-w-prose">{advice.explanation}</p>
        <p className="mt-3 text-sm">Next starting window: <b>{advice.next.label}</b> (in about {Math.max(0, Math.round(advice.hoursUntilNext))} hours).</p>
        <p className="text-sm text-mute mt-3">It's your call either way. Open a project to copy its package, then post in the app.</p>
      </section>

      <div className="grid md:grid-cols-3 gap-4">
        {PLATFORMS.map((p) => (
          <section key={p} className="panel p-4" aria-labelledby={`bt-${p}`}>
            <h2 id={`bt-${p}`} className="text-xl font-bold mb-3">{PLATFORM_LABEL[p]}</h2>
            <ul className="flex flex-col gap-3">
              {postingWindows(p, ctx, now).map((w) => (
                <li key={w.rank} className="text-sm">
                  <div className="text-mute text-xs">{w.rank === "best" ? "Best recommended window" : w.rank === "second" ? "Second-best window" : "Alternative testing window"}</div>
                  <div className="font-semibold text-[15px]">{w.label}</div>
                  <div className="text-mute mt-0.5">{w.why}</div>
                  <div className="flex flex-wrap items-center gap-2 mt-1"><EvidenceBadge e={w.evidence} /><span className="text-xs text-mute">Confidence: {w.confidence}</span></div>
                </li>
              ))}
            </ul>
            <p className="text-xs text-mute mt-3">Account data available: none connected. {postingWindows(p, ctx, now)[0].dataNote}</p>
          </section>
        ))}
      </div>
      <p className="text-sm text-mute mt-6 max-w-prose">How this works: windows come from general guidance about when people browse each app, adjusted for your goal ({brand.objective === "bulk_buyers" ? "business buyers → weekday working hours" : "consumers → evenings and lunch"}) and aimed at your main audience's time zone. No posting time guarantees reach.</p>
    </div>
  );
}
