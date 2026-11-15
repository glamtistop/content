"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { Icon } from "@/components/icons";
import { Empty, Notice, PageHeader, cx } from "@/components/ui";
import { MediaPreview, ScriptEditor, Understanding } from "@/components/workspace/CenterPanel";
import { ExportCenter, Packages, Readiness, Versions } from "@/components/workspace/RightPanel";
import { SetupPanel } from "@/components/workspace/SetupPanel";
import { useProject } from "@/components/workspace/useProject";
import type { Project } from "@/lib/types";

export default function WorkspacePage() {
  return <Suspense><Router /></Suspense>;
}

function Router() {
  const id = useSearchParams().get("id");
  return id ? <Workspace id={id} key={id} /> : <ProjectList />;
}

function ProjectList() {
  const { brand, store, toast } = useApp();
  const [list, setList] = useState<Project[] | null>(null);
  useEffect(() => { if (brand) store.listProjects(brand.id).then(setList); }, [brand, store]);
  if (!brand) return null;
  return (
    <div className="max-w-4xl mx-auto">
      <PageHeader title="Content workspace" sub={`All saved projects for ${brand.name}. Everything autosaves.`} action={<Link href="/create/" className="btn-primary"><Icon name="plus" size={18} />New post</Link>} />
      {list === null ? <p className="text-mute">Loading…</p> : list.length === 0 ? (
        <Empty icon="layers" title="No projects yet" action={<Link href="/create/" className="btn-primary">Create my next post</Link>}>Upload a photo or clip, or start from an idea.</Empty>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map((p) => (
            <li key={p.id} className="panel flex items-center gap-3 p-3">
              <Link href={`/workspace/?id=${p.id}`} className="flex-1 min-w-0">
                <div className="font-medium truncate">{p.name}</div>
                <div className="text-sm text-mute">{p.mediaIds.length} file(s) · {p.plan ? (p.stage === "approved" ? "Approved" : "Draft ready") : "Not written yet"} · {new Date(p.updatedAt).toLocaleString()}</div>
              </Link>
              <button className="btn-quiet" aria-label={`Delete ${p.name}`} onClick={async () => {
                if (!confirm(`Delete “${p.name}” and its media? This can't be undone.`)) return;
                await store.deleteProject(p.id);
                setList((l) => l!.filter((x) => x.id !== p.id));
                toast("Project deleted.");
              }}><Icon name="trash" size={18} /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type Tab = "setup" | "script" | "post" | "review";

/** Three columns only when there's genuinely room; otherwise tabs (phones, tablets, foldables). */
function useWide() {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1280px)");
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return wide;
}

function Workspace({ id }: { id: string }) {
  const api = useProject(id);
  const { project: p, missing, save, busy, notice, setNotice, update } = api;
  const { store, toast } = useApp();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("setup");
  const wide = useWide();
  useEffect(() => { if (p?.plan && tab === "setup") setTab("script"); /* jump once content exists */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!p?.plan]);

  if (missing) return <Empty icon="layers" title="Project not found" action={<Link className="btn-primary" href="/workspace/">All projects</Link>}>It may have been deleted, or it belongs to another account or brand.</Empty>;
  if (!p) return <p className="text-mute py-10 text-center">Opening project…</p>;

  const failedJob = p.jobs?.slice().reverse().find((j) => j.status === "failed");
  const center = (
    <div className="flex flex-col gap-4 min-w-0">
      <MediaPreview api={api} />
      <Understanding api={api} />
      {p.plan ? <ScriptEditor api={api} /> : !busy && (
        <div className="panel p-6 text-mute">
          {p.mediaIds.length || p.idea ? "Pick your options on the left, then tap “Analyze and write my post”." : "Add media or describe the post to get started."}
        </div>
      )}
    </div>
  );
  const right = (
    <div className="flex flex-col gap-4 min-w-0">
      <Readiness api={api} />
      <Packages api={api} />
      <ExportCenter api={api} />
      <Versions api={api} />
    </div>
  );

  return (
    <div className="max-w-[1500px] mx-auto">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input className="bg-transparent font-display text-2xl sm:text-3xl font-bold min-w-0 flex-1 focus:outline-none border-b border-transparent focus:border-teal" value={p.name} aria-label="Project name"
          onChange={(e) => update((x) => ({ ...x, name: e.target.value }))} data-testid="project-name" />
        <span className={cx("text-sm", save === "error" ? "text-bad" : "text-mute")} aria-live="polite" data-testid="save-state">
          {save === "saving" ? "Saving…" : save === "error" ? "Not saved — check connection" : store.mode === "local" ? "Saved on this device" : "Saved"}
        </span>
        <button className="btn-quiet" aria-label="Delete project" onClick={async () => {
          if (!confirm("Delete this project and its media? This can't be undone.")) return;
          await store.deleteProject(p.id); toast("Project deleted."); router.push("/workspace/");
        }}><Icon name="trash" size={18} /></button>
      </div>

      {busy && (
        <div className="mb-4 rounded-lg border border-teal/40 bg-teal/5 px-4 py-3 flex items-center gap-3" role="status" data-testid="busy">
          <span className="h-4 w-4 rounded-full border-2 border-teal border-t-transparent animate-spin" aria-hidden="true" />
          {busy}…
        </div>
      )}
      {notice && <div className="mb-4"><Notice kind="warn" onClose={() => setNotice(null)}>{notice}</Notice></div>}
      {failedJob && !busy && <div className="mb-4"><Notice kind="error" onClose={() => update((x) => ({ ...x, jobs: [] }), true)}>{failedJob.message}</Notice></div>}

      {wide ? (
        <div className="grid grid-cols-[300px_minmax(0,1fr)_400px] gap-6 items-start">
          <aside className="sticky top-6 max-h-[calc(100dvh-3rem)] overflow-y-auto scrollbar-thin pr-1"><SetupPanel api={api} /></aside>
          {center}
          <aside>{right}</aside>
        </div>
      ) : (<>
      <div className="sticky z-20 -mx-4 px-4 py-2 bg-black/95 backdrop-blur mb-4" style={{ top: "calc(56px + var(--safe-top))" }}>
        <div className="grid grid-cols-4 gap-1 rounded-lg bg-ink border border-line p-1" role="tablist" aria-label="Workspace sections">
          {(["setup", "script", "post", "review"] as Tab[]).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} data-testid={`wtab-${t}`}
              className={cx("rounded-md min-h-[40px] text-sm font-medium capitalize", tab === t ? "bg-graphite text-paper" : "text-mute")} disabled={t !== "setup" && !p.plan && t !== "script"}>
              {t === "post" ? "Packages" : t}
            </button>
          ))}
        </div>
      </div>
      <div>
        {tab === "setup" && <SetupPanel api={api} />}
        {tab === "script" && center}
        {tab === "post" && <div className="flex flex-col gap-4"><Packages api={api} /><ExportCenter api={api} /></div>}
        {tab === "review" && <div className="flex flex-col gap-4"><Readiness api={api} /><Versions api={api} /></div>}
      </div>
      </>)}
    </div>
  );
}
