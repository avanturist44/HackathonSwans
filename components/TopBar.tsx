import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "./icons";

type Tab = "brief" | "share" | "provider";

const TABS: { id: Tab; href: string; label: string }[] = [
  { id: "brief", href: "/matter", label: "Attorney brief" },
  { id: "share", href: "/matter/share", label: "Share review" },
  { id: "provider", href: "/matter/share/preview", label: "Provider view" },
];

/** Attorney top bar. Pass `active={null}` with no tabs for the provider-facing page. */
export function TopBar({ active, right, showTabs = true }: { active: Tab | null; right?: ReactNode; showTabs?: boolean }) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        {showTabs ? (
          <Link href="/matter" className="brand">
            <Logo />
            <span>CaseBrief</span>
          </Link>
        ) : (
          <div className="brand">
            <Logo />
            <span>CaseBrief</span>
          </div>
        )}
        {showTabs && (
          <nav aria-label="Switch view" className="tabs">
            {TABS.map((t) => (
              <Link key={t.id} href={t.href} className="tab" aria-current={active === t.id ? "page" : undefined}>
                {t.label}
              </Link>
            ))}
          </nav>
        )}
        {right && <div className="topbar-meta">{right}</div>}
      </div>
    </header>
  );
}
