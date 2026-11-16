"use client";
import { REASONS } from "@/lib/types";
import type { ProjectApi } from "./useProject";

/** One optional tap after a regenerate or rejection: why? Skipping is always fine. */
export function ReasonBar({ api }: { api: ProjectApi }) {
  const ask = api.askReason;
  if (!ask) return null;
  return (
    <div role="group" aria-label={ask.question} data-testid="reason-bar"
      className="mb-4 rounded-lg border border-line bg-char px-3 py-2.5 flex flex-wrap items-center gap-2 text-sm">
      <span className="mr-1"><b className="font-medium">{ask.question}</b> <span className="text-mute">Optional — it helps ContentPilot learn your style.</span></span>
      {REASONS.map((r) => (
        <button key={r.id} type="button" className="chip !min-h-[34px]" data-testid={`reason-${r.id}`} onClick={() => api.answerReason([r.id])}>{r.label}</button>
      ))}
      <button type="button" className="btn-quiet !min-h-[34px] text-sm" data-testid="reason-skip" onClick={() => api.answerReason(null)}>Skip</button>
    </div>
  );
}
