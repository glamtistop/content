import type { ReactNode } from "react";
import type { FeatureStatus } from "@/lib/features";
import { PageHeader, StatusBadge } from "./ui";

export function StatusPage({ title, status, intro, needs, now, children }: { title: string; status: FeatureStatus; intro: string; needs: string[]; now?: ReactNode; children?: ReactNode }) {
  return (
    <div className="max-w-3xl mx-auto">
      <PageHeader title={title} action={<StatusBadge status={status} />} sub={intro} />
      {children}
      {now && <section className="panel p-5 mt-6"><h2 className="font-semibold mb-2">What you can do today</h2><div className="text-sm text-paper/90 flex flex-col gap-2">{now}</div></section>}
      <section className="mt-6">
        <h2 className="font-semibold mb-2">What it takes to switch this on</h2>
        <ul className="list-disc pl-5 text-sm text-mute flex flex-col gap-1">{needs.map((n) => <li key={n}>{n}</li>)}</ul>
      </section>
    </div>
  );
}
