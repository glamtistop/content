"use client";
import { useEffect } from "react";
import { learningMetric } from "@/lib/memory";
import type { PreferenceRule } from "@/lib/types";
import { PLATFORM_LABEL } from "@/lib/types";
import { useApp } from "./AppProvider";
import { cx } from "./ui";
import { useBrandMemory } from "./workspace/useBrandMemory";

const STATUS_LABEL: Record<PreferenceRule["status"], string> = { active: "On", suggested: "Still learning", disabled: "Off" };

/** "What ContentPilot has learned": every learned rule, its evidence, and the user's switch. */
export function MemoryPanel() {
  const mem = useBrandMemory();
  const { toast, brand } = useApp();
  const count = mem.events.length;
  // refresh counts (and fading of old decisions) whenever the panel opens or decisions load
  useEffect(() => { if (count) void mem.relearn(); }, [count]); // eslint-disable-line react-hooks/exhaustive-deps

  const order: PreferenceRule["status"][] = ["active", "suggested", "disabled"];
  const rules = [...mem.rules].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status) || b.evidence - a.evidence);
  const metric = learningMetric(mem.events);

  return (
    <section className="mt-12" aria-labelledby="learned-h" data-testid="memory-panel">
      <h2 id="learned-h" className="text-xl font-bold mb-1">What ContentPilot has learned</h2>
      <p className="text-sm text-mute max-w-prose">
        Learned from your own edits, cuts, rewrites and rejections for {brand?.name}. A pattern switches on after 3 consistent decisions;
        a hook you reject is avoided right away. Older decisions count for less over time. You can switch anything off.
      </p>
      <p className="text-sm mt-2" data-testid="memory-count">
        {count} decision{count === 1 ? "" : "s"} recorded
        {metric ? ` · you've been changing about ${metric.recent}% of the wording in recent drafts (earlier: ${metric.earlier}%).` : "."}
      </p>

      {rules.length === 0 ? (
        <div className="panel p-4 mt-4 text-sm text-mute">Nothing learned yet. Edit, cut, rewrite or reject drafts as you normally would, and patterns will show up here.</div>
      ) : (
        <ul className="flex flex-col gap-2 mt-4">
          {rules.map((r) => (
            <li key={r.id} className={cx("panel p-3 flex flex-wrap items-start gap-3", r.status === "disabled" && "opacity-60")} data-testid={`rule-${r.kind}`}>
              <div className="flex-1 min-w-[200px]">
                <div className="text-[15px]">{r.text}</div>
                <div className="text-xs text-mute mt-0.5">
                  {r.events} decision{r.events === 1 ? "" : "s"}{r.counter ? `, ${r.counter} against` : ""}
                  {r.scope.platform !== "*" ? ` · ${PLATFORM_LABEL[r.scope.platform]}` : ""}
                  {r.userSet ? " · set by you" : ""}
                </div>
              </div>
              <span className={cx("text-xs rounded-full border px-2 py-0.5", r.status === "active" ? "border-teal/60 text-teal" : "border-line text-mute")}>{STATUS_LABEL[r.status]}</span>
              <button type="button" className="btn-ghost !min-h-[34px] text-sm" data-testid="rule-toggle"
                onClick={() => mem.setRule(r, { status: r.status === "active" ? "disabled" : "active" })}>
                {r.status === "active" ? (r.kind === "rejected_hook" ? "Allow again" : "Turn off") : "Turn on"}
              </button>
            </li>
          ))}
        </ul>
      )}

      {(count > 0 || rules.length > 0) && (
        <button type="button" className="btn-ghost text-bad mt-4" data-testid="memory-reset" onClick={async () => {
          if (!confirm(`Forget everything ContentPilot has learned for ${brand?.name}? Your projects aren't affected.`)) return;
          try { await mem.reset(); toast("Learning reset."); } catch (e) { toast((e as Error).message, "error"); }
        }}>Reset what it has learned</button>
      )}
    </section>
  );
}
