"use client";
import { useEffect, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { Notice, PageHeader, StatusBadge, Toggle } from "@/components/ui";
import { CLOUD_ENABLED } from "@/lib/config";
import { featureList } from "@/lib/features";
import { RULES } from "@/lib/platforms";
import { supabase } from "@/lib/store";
import type { UsageRecord } from "@/lib/types";
import { PLATFORMS, PLATFORM_LABEL } from "@/lib/types";

export default function Settings() {
  const { aiEnabled, setAiEnabled, store, toast, userEmail } = useApp();
  const [usage, setUsage] = useState<UsageRecord[]>([]);
  const [test, setTest] = useState<string>("");
  useEffect(() => { store.listUsage().then(setUsage).catch(() => {}); }, [store]);
  const month = new Date().toISOString().slice(0, 7);
  const thisMonth = usage.filter((u) => u.at.startsWith(month));

  return (
    <div className="max-w-4xl mx-auto flex flex-col gap-8">
      <PageHeader title="Integrations & settings" />

      <section aria-labelledby="acct">
        <h2 id="acct" className="text-xl font-bold mb-3">Account and storage</h2>
        {CLOUD_ENABLED ? (
          <div className="panel p-4 flex flex-wrap items-center gap-3 justify-between">
            <span>Signed in as <b>{userEmail}</b>. Media is stored in a private bucket only your account can read.</span>
            <button className="btn-ghost" onClick={() => supabase()?.auth.signOut()}>Sign out</button>
          </div>
        ) : (
          <Notice kind="warn">
            <b>This-device mode.</b> Your projects and media are saved in this browser only — clearing site data deletes them, and they don't sync to your phone or Mac.
            To get your own login and sync, connect Supabase (free tier) using the setup guide in the project's README, then rebuild.
          </Notice>
        )}
      </section>

      <section aria-labelledby="ai">
        <h2 id="ai" className="text-xl font-bold mb-3">AI</h2>
        <div className="panel p-4 flex flex-col gap-3">
          {CLOUD_ENABLED ? (
            <>
              <Toggle checked={aiEnabled} onChange={setAiEnabled} label="Use AI for analysis and writing" />
              <p className="text-sm text-mute">AI runs on your Supabase server function with your own provider key (Gemini or Claude API). Keys never reach this app. When AI is off or unavailable, the template writer is used and labeled.</p>
              <div className="flex flex-wrap items-center gap-2">
                <button className="btn-ghost text-sm" onClick={async () => {
                  setTest("Testing…");
                  const { data, error } = await supabase()!.functions.invoke("ai", { body: { action: "ping" } });
                  setTest(error ? `Not reachable: ${error.message}` : data?.ok ? `Connected: ${data.provider} (${data.model}). ${data.limit ? `${data.used}/${data.limit} calls used this month.` : ""}` : `Not ready: ${data?.error}`);
                }}>Test AI connection</button>
                <span className="text-sm">{test}</span>
              </div>
            </>
          ) : (
            <p className="text-sm">AI needs an account backend so your key stays on a server. Until then: <StatusBadge status="Fallback Available" /> — technical media checks plus the template writer.</p>
          )}
          <div className="text-sm text-mute">AI calls logged this month: {thisMonth.filter((u) => u.ok).length} succeeded, {thisMonth.filter((u) => !u.ok).length} failed. Monthly limits are set on the server (MONTHLY_AI_CALL_LIMIT).</div>
          {usage.length > 0 && (
            <details className="text-sm"><summary className="cursor-pointer text-teal">Recent usage</summary>
              <ul className="mt-2 flex flex-col gap-1">{usage.slice(0, 20).map((u) => <li key={u.id} className="text-mute">{new Date(u.at).toLocaleString()} · {u.kind} · {u.provider} · {u.ok ? "ok" : "failed"} · {u.note}</li>)}</ul>
            </details>
          )}
        </div>
      </section>

      <section aria-labelledby="feat">
        <h2 id="feat" className="text-xl font-bold mb-3">Feature status</h2>
        <ul className="flex flex-col gap-1.5">
          {featureList(aiEnabled).map((f) => (
            <li key={f.name} className="panel p-3 flex flex-wrap items-start gap-2 justify-between">
              <div className="min-w-0 flex-1"><div className="font-medium text-[15px]">{f.name}</div><div className="text-sm text-mute">{f.note} · Phase {f.phase}</div></div>
              <StatusBadge status={f.status} />
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="rules">
        <h2 id="rules" className="text-xl font-bold mb-3">Platform rules in use</h2>
        <div className="grid md:grid-cols-3 gap-3">
          {PLATFORMS.map((p) => {
            const r = RULES[p];
            return (
              <div key={p} className="panel p-3 text-sm">
                <div className="font-semibold mb-1">{PLATFORM_LABEL[p]}</div>
                <div>Caption: {r.captionMax.toLocaleString()} characters{r.captionMaxNative ? ` (${r.captionMaxNative.toLocaleString()} in-app)` : ""}</div>
                <div>Hashtags: up to {r.hashtagMax}</div>
                <div>Short video: up to {r.video.shortFormMaxSec}s</div>
                <div className="text-xs text-mute mt-2">Checked {r.checkedOn}. Sources: {r.sources.map((s, i) => <a key={i} href={s.url} target="_blank" rel="noreferrer" className="underline block">{s.label}</a>)}</div>
              </div>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="priv">
        <h2 id="priv" className="text-xl font-bold mb-3">Privacy and your data</h2>
        <div className="panel p-4 text-sm flex flex-col gap-2">
          <p>Your media is private to your account. It's sent to an AI provider only when you tap Analyze, only as downscaled images, frames or short clips, and is not used to train models (paid API tiers of Gemini and Claude don't train on API data). ContentPilot never asks for social-media passwords and never posts without your explicit approval.</p>
          <p>Text and speech inside your uploads are treated as content to describe — never as instructions.</p>
          <button className="btn-ghost text-bad self-start mt-2" data-testid="delete-all" onClick={async () => {
            if (!confirm(CLOUD_ENABLED ? "Delete your account, every brand, project, media file and version? This can't be undone." : "Delete every brand, project, media file and version stored in this browser? This can't be undone.")) return;
            try { await store.deleteEverything(); toast("Everything was deleted."); setTimeout(() => location.assign((process.env.NEXT_PUBLIC_BASE_PATH || "") + "/"), 600); }
            catch (e) { toast((e as Error).message, "error"); }
          }}>{CLOUD_ENABLED ? "Delete my account and all data" : "Delete all data on this device"}</button>
        </div>
      </section>
    </div>
  );
}
