"use client";
import { useEffect, useState, type ReactNode } from "react";
import type { FeatureStatus } from "@/lib/features";
import type { Evidence } from "@/lib/types";
import { EVIDENCE_LABEL } from "@/lib/types";
import { Icon, type IconName } from "./icons";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function PageHeader({ title, sub, action }: { title: string; sub?: ReactNode; action?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3 mb-6">
      <div className="min-w-0">
        <h1 className="text-3xl sm:text-4xl font-bold leading-tight">{title}</h1>
        {sub && <p className="text-mute mt-1.5 max-w-prose">{sub}</p>}
      </div>
      {action}
    </header>
  );
}

const STATUS_STYLE: Record<FeatureStatus, string> = {
  Working: "border-teal/50 text-teal",
  "Fallback Available": "border-warn/50 text-warn",
  "Requires Credentials": "border-mute/50 text-mute",
  "Requires Platform Approval": "border-mute/50 text-mute",
  "Planned / Not Implemented": "border-line text-mute/80",
};
export function StatusBadge({ status }: { status: FeatureStatus }) {
  return <span className={cx("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs whitespace-nowrap", STATUS_STYLE[status])}>{status}</span>;
}

const EV_STYLE: Record<Evidence, string> = {
  verified: "border-teal/50 text-teal",
  cached: "border-teal/30 text-teal/80",
  inferred: "border-mute/40 text-mute",
  general: "border-mute/40 text-mute",
  demo: "border-warn/50 text-warn",
};
export function EvidenceBadge({ e }: { e: Evidence }) {
  return <span className={cx("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] whitespace-nowrap", EV_STYLE[e])} title={EVIDENCE_LABEL[e]}>{EVIDENCE_LABEL[e]}</span>;
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

export function CopyButton({ text, label = "Copy", className, testid }: { text: string | (() => string); label?: string; className?: string; testid?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      data-testid={testid}
      className={cx("btn-ghost !min-h-[36px] !px-3 text-sm", className)}
      onClick={async () => {
        const ok = await copyText(typeof text === "function" ? text() : text);
        if (ok) { setDone(true); setTimeout(() => setDone(false), 1400); }
      }}
    >
      <Icon name={done ? "check" : "copy"} size={16} />
      {done ? "Copied" : label}
    </button>
  );
}

export function Progress({ value, label }: { value: number; label?: string }) {
  return (
    <div role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className="h-1.5 rounded-full bg-graphite overflow-hidden">
        <div className="h-full bg-teal transition-[width] duration-200" style={{ width: `${Math.round(value * 100)}%` }} />
      </div>
    </div>
  );
}

export function Empty({ icon, title, children, action }: { icon: IconName; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="panel p-8 text-center flex flex-col items-center gap-3">
      <Icon name={icon} size={28} className="text-teal" />
      <h3 className="text-lg font-semibold">{title}</h3>
      {children && <div className="text-mute max-w-md">{children}</div>}
      {action}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70" onClick={onClose}>
      <div
        role="dialog" aria-modal="true" aria-label={title}
        className={cx("panel w-full max-h-[92dvh] overflow-y-auto p-5 sm:p-6 rounded-b-none sm:rounded-xl", wide ? "sm:max-w-3xl" : "sm:max-w-lg")}
        style={{ paddingBottom: "calc(1.25rem + var(--safe-bottom))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="text-xl font-semibold">{title}</h2>
          <button className="btn-quiet" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="block text-xs text-mute/80 mt-1">{hint}</span>}
    </label>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex items-center gap-3 min-h-[44px] text-left">
      <span className={cx("relative inline-block h-6 w-10 rounded-full transition-colors", checked ? "bg-teal" : "bg-graphite border border-line")}>
        <span className={cx("absolute top-0.5 h-5 w-5 rounded-full bg-paper transition-transform", checked ? "translate-x-[18px]" : "translate-x-0.5")} />
      </span>
      <span>{label}</span>
    </button>
  );
}

export function Notice({ kind = "info", children, onClose }: { kind?: "info" | "warn" | "error"; children: ReactNode; onClose?: () => void }) {
  const style = kind === "error" ? "border-bad/50 text-[#ffb3b3]" : kind === "warn" ? "border-warn/50 text-[#f7d58a]" : "border-teal/40 text-paper/90";
  return (
    <div role={kind === "error" ? "alert" : "status"} className={cx("rounded-lg border bg-ink px-3.5 py-2.5 text-sm flex items-start gap-3", style)}>
      <div className="flex-1">{children}</div>
      {onClose && <button className="text-mute hover:text-paper" onClick={onClose} aria-label="Dismiss"><Icon name="x" size={16} /></button>}
    </div>
  );
}
