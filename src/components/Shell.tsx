"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { CLOUD_ENABLED } from "@/lib/config";
import { useApp } from "./AppProvider";
import { Icon, type IconName } from "./icons";
import { cx } from "./ui";

export const NAV: { href: string; label: string; icon: IconName; mobile?: boolean }[] = [
  { href: "/", label: "Dashboard", icon: "home", mobile: true },
  { href: "/create/", label: "Create new post", icon: "plus", mobile: true },
  { href: "/library/", label: "Media library", icon: "images", mobile: true },
  { href: "/workspace/", label: "Content workspace", icon: "layers" },
  { href: "/trending/", label: "Trending now", icon: "trend" },
  { href: "/music/", label: "Music & sounds", icon: "music" },
  { href: "/best-time/", label: "Best time to post", icon: "clock", mobile: true },
  { href: "/calendar/", label: "Content calendar", icon: "calendar" },
  { href: "/analytics/", label: "Analytics", icon: "chart" },
  { href: "/orders/", label: "Orders & leads", icon: "receipt" },
  { href: "/brand/", label: "Brand profile", icon: "brand" },
  { href: "/settings/", label: "Integrations & settings", icon: "settings" },
];

function isActive(path: string, href: string) {
  const p = path.endsWith("/") ? path : path + "/";
  return href === "/" ? p === "/" : p.startsWith(href);
}

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname() || "/";
  const { brand, brands, setActiveBrand, ready } = useApp();
  const [more, setMore] = useState(false);
  if (path.startsWith("/login")) return <>{children}</>;

  const brandSwitcher = (
    <label className="block">
      <span className="sr-only">Active brand</span>
      <select className="field !py-2 text-sm" value={brand?.id ?? ""} onChange={(e) => setActiveBrand(e.target.value)}>
        {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
      </select>
    </label>
  );

  return (
    <div className="min-h-[100dvh] lg:flex">
      {/* desktop rail */}
      <aside className="hidden lg:flex lg:flex-col w-64 shrink-0 border-r border-line bg-ink sticky top-0 h-[100dvh] p-4 gap-4">
        <Link href="/" className="flex items-center gap-2 px-1 pt-1">
          <Mark />
          <span className="font-display text-xl font-bold tracking-tight">ContentPilot</span>
        </Link>
        {brandSwitcher}
        <nav className="flex flex-col gap-0.5 overflow-y-auto scrollbar-thin -mx-1 px-1" aria-label="Main">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={cx("flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px]", isActive(path, n.href) ? "bg-graphite text-paper" : "text-mute hover:text-paper hover:bg-char")} aria-current={isActive(path, n.href) ? "page" : undefined}>
              <Icon name={n.icon} size={18} className={isActive(path, n.href) ? "text-teal" : ""} />
              {n.label}
            </Link>
          ))}
        </nav>
        <ModeNote />
      </aside>

      {/* mobile top bar */}
      <div className="lg:hidden sticky top-0 z-30 bg-ink/95 backdrop-blur border-b border-line" style={{ paddingTop: "var(--safe-top)" }}>
        <div className="flex items-center gap-3 h-14 safe-x">
          <Link href="/" className="flex items-center gap-2" aria-label="ContentPilot home"><Mark /></Link>
          <div className="flex-1 min-w-0">{brandSwitcher}</div>
        </div>
      </div>

      <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-10 pt-5 lg:pt-8 safe-pb" style={{ paddingLeft: "max(1rem, var(--safe-left))", paddingRight: "max(1rem, var(--safe-right))" }}>
        {ready ? children : <div className="text-mute py-20 text-center">Loading your studio…</div>}
      </main>

      {/* mobile bottom bar */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-ink/95 backdrop-blur border-t border-line" style={{ paddingBottom: "var(--safe-bottom)" }} aria-label="Main">
        <div className="grid grid-cols-5" style={{ paddingLeft: "var(--safe-left)", paddingRight: "var(--safe-right)" }}>
          {NAV.filter((n) => n.mobile).map((n) => (
            <Link key={n.href} href={n.href} className={cx("nav-item flex flex-col items-center justify-center gap-0.5 h-16 text-[11px]", isActive(path, n.href) ? "text-teal" : "text-mute")} aria-current={isActive(path, n.href) ? "page" : undefined}>
              <Icon name={n.icon} size={22} />
              {n.label.split(" ")[0]}
            </Link>
          ))}
          <button className={cx("nav-item flex flex-col items-center justify-center gap-0.5 h-16 text-[11px]", more ? "text-teal" : "text-mute")} onClick={() => setMore(true)} aria-haspopup="dialog">
            <Icon name="more" size={22} />More
          </button>
        </div>
      </nav>
      {more && (
        <div className="lg:hidden fixed inset-0 z-50 bg-black/70" onClick={() => setMore(false)}>
          <div className="absolute bottom-0 inset-x-0 panel rounded-b-none p-4 max-h-[90dvh] overflow-y-auto" style={{ paddingBottom: "calc(1rem + var(--safe-bottom))", paddingLeft: "max(1rem, var(--safe-left))", paddingRight: "max(1rem, var(--safe-right))" }} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="More screens">
            <div className="grid grid-cols-2 gap-2">
              {NAV.filter((n) => !n.mobile).map((n) => (
                <Link key={n.href} href={n.href} onClick={() => setMore(false)} className="flex items-center gap-2.5 rounded-lg bg-ink border border-line px-3 py-3 text-sm">
                  <Icon name={n.icon} size={18} className="text-teal" />{n.label}
                </Link>
              ))}
            </div>
            <div className="mt-3"><ModeNote /></div>
          </div>
        </div>
      )}
    </div>
  );
}

function ModeNote() {
  const { userEmail } = useApp();
  return (
    <div className="mt-auto text-xs text-mute rounded-lg border border-line p-3">
      {CLOUD_ENABLED
        ? <>Signed in as <span className="text-paper">{userEmail}</span></>
        : <>This-device mode: your work is saved in this browser only. <Link className="text-teal underline" href="/settings/">Set up an account</Link> to sync.</>}
    </div>
  );
}

export function Mark() {
  // a print nozzle drawing a layer — the brand's world, not a generic logo
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
      <rect x="0" y="0" width="32" height="32" rx="8" fill="#17191B" stroke="#33383C" />
      <path d="M11 6h10v5l-3 4h-4l-3-4z" fill="#19D3C5" />
      <rect x="6" y="21" width="20" height="2.2" rx="1.1" fill="#F4F6F6" />
      <rect x="9" y="24.8" width="14" height="2.2" rx="1.1" fill="#C9A85A" />
    </svg>
  );
}
