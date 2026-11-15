"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { Icon, type IconName } from "@/components/icons";
import { Onboarding } from "@/components/Onboarding";
import { EvidenceBadge, StatusBadge } from "@/components/ui";
import { CLOUD_ENABLED } from "@/lib/config";
import { ideasFor } from "@/lib/ideas";
import type { Project } from "@/lib/types";
import { OBJECTIVES } from "@/lib/types";

const QUICK: { label: string; href: string; icon: IconName }[] = [
  { label: "Upload 1 picture", href: "/create/?mode=one-photo", icon: "image" },
  { label: "Upload multiple pictures", href: "/create/?mode=photos", icon: "images" },
  { label: "Upload video", href: "/create/?mode=video", icon: "video" },
  { label: "Upload multiple clips", href: "/create/?mode=clips", icon: "clips" },
  { label: "Combine pictures and videos", href: "/create/?mode=mix", icon: "mix" },
  { label: "Create from an idea", href: "/create/?mode=idea", icon: "bulb" },
  { label: "Post right now", href: "/best-time/#now", icon: "bolt" },
  { label: "What's trending today?", href: "/trending/", icon: "trend" },
];

export default function Dashboard() {
  const { brand, store, aiEnabled } = useApp();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!brand) return;
    (async () => {
      const ps = await store.listProjects(brand.id);
      setProjects(ps);
      const media = await store.listBrandMedia(brand.id);
      const t: Record<string, string> = {};
      for (const m of media.slice().reverse()) if (!t[m.projectId] && m.thumbnail) t[m.projectId] = m.thumbnail;
      setThumbs(t);
    })();
  }, [brand, store]);

  if (!brand) return null;
  const goal = OBJECTIVES.find((o) => o.id === brand.objective)?.label;
  const ideas = ideasFor(brand).slice(0, 5);

  return (
    <div className="max-w-6xl mx-auto">
      {!brand.onboarded && <Onboarding />}

      <section className="layers rounded-2xl border border-line p-5 sm:p-8 mb-8 relative overflow-hidden">
        <p className="text-mute">{brand.name} · Goal: {goal}</p>
        <h1 className="text-4xl sm:text-6xl font-extrabold leading-[0.95] mt-2 mb-6 max-w-[14ch]">What are we posting today?</h1>
        <Link href="/create/" className="btn-primary !min-h-[64px] !px-8 !text-lg font-bold tracking-wide w-full sm:w-auto" data-testid="create-cta">
          <Icon name="plus" size={24} /> CREATE MY NEXT POST
        </Link>
      </section>

      <section aria-labelledby="qa" className="mb-10">
        <h2 id="qa" className="sr-only">Quick actions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {QUICK.map((q) => (
            <Link key={q.label} href={q.href} className="panel px-3.5 py-3.5 flex items-center gap-3 hover:border-teal/50 min-h-[64px]">
              <Icon name={q.icon} className="text-teal shrink-0" />
              <span className="text-[15px] leading-tight">{q.label}</span>
            </Link>
          ))}
        </div>
      </section>

      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-8">
        <section aria-labelledby="rp">
          <div className="flex items-baseline justify-between mb-3">
            <h2 id="rp" className="text-xl font-semibold">Recent projects</h2>
            <Link href="/workspace/" className="text-sm text-teal">All projects</Link>
          </div>
          {projects === null ? <p className="text-mute">Loading…</p> : projects.length === 0 ? (
            <div className="panel p-6 text-mute">No projects yet. Your first post starts with the big button above.</div>
          ) : (
            <ul className="flex flex-col gap-2">
              {projects.slice(0, 6).map((p) => (
                <li key={p.id}>
                  <Link href={`/workspace/?id=${p.id}`} className="panel flex items-center gap-3 p-2.5 hover:border-teal/50">
                    <div className="h-14 w-11 rounded-md bg-graphite overflow-hidden shrink-0">
                      {thumbs[p.id] ? <img src={thumbs[p.id]} alt="" className="h-full w-full object-cover" /> : <Icon name="bulb" className="m-auto mt-4 text-mute" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{p.name}</div>
                      <div className="text-sm text-mute">{stageLabel(p)} · {new Date(p.updatedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</div>
                    </div>
                    {p.stage === "approved" && <span className="text-xs text-gold border border-gold/50 rounded-full px-2 py-0.5">Approved</span>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="ideas">
          <div className="flex items-baseline justify-between mb-3 gap-2">
            <h2 id="ideas" className="text-xl font-semibold">What should I post today?</h2>
            <EvidenceBadge e="general" />
          </div>
          <ul className="flex flex-col gap-2">
            {ideas.map((i) => (
              <li key={i.title} className="panel p-3.5">
                <div className="font-medium">{i.title}</div>
                <div className="text-sm text-mute mt-0.5">Hook: “{i.hook}”</div>
                <div className="text-sm text-mute">Needs: {i.media} · {i.format}, ~{i.duration}s</div>
                <Link href={`/create/?mode=idea&idea=${encodeURIComponent(i.title)}`} className="inline-flex items-center gap-1.5 text-sm text-teal mt-2 min-h-[32px]">Use this idea</Link>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section aria-labelledby="conn" className="mt-10">
        <h2 id="conn" className="text-xl font-semibold mb-3">Publishing, analytics and sales</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {[
            { t: "Scheduled posts", s: "Planned / Not Implemented" as const, d: "Scheduling arrives with the content calendar." },
            { t: "Latest published content", s: "Requires Platform Approval" as const, d: "Shows once TikTok/Meta accounts are connected." },
            { t: "Top-performing content & analytics", s: "Requires Platform Approval" as const, d: "No numbers are shown until real data exists." },
            { t: "Sales and lead activity", s: "Planned / Not Implemented" as const, d: "Manual order and lead entry comes next." },
            { t: "Trend research", s: "Requires Credentials" as const, d: "No verified trend source connected." },
            { t: "AI writing", s: (aiEnabled ? "Working" : "Fallback Available") as "Working" | "Fallback Available", d: aiEnabled ? "Uses your server-side AI key." : CLOUD_ENABLED ? "Turned off in Settings." : "Template writer in use until AI is connected." },
          ].map((x) => (
            <div key={x.t} className="panel p-3.5">
              <div className="flex items-start justify-between gap-2"><span className="font-medium">{x.t}</span><StatusBadge status={x.s} /></div>
              <p className="text-sm text-mute mt-1">{x.d}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function stageLabel(p: Project) {
  return { media: "Adding media", setup: "Choosing format", analyzing: "Analyzing", ready: "Draft ready", approved: "Approved" }[p.stage];
}
