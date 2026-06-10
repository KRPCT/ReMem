"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, LibraryBig, GraduationCap, BarChart3 } from "lucide-react";

const tabs = [
  { href: "/",      label: "首页", Icon: House },
  { href: "/decks", label: "牌组", Icon: LibraryBig },
  { href: "/decks", label: "学习", Icon: GraduationCap },
  { href: "/stats", label: "统计", Icon: BarChart3 },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <div className="md:hidden">
      <nav
        className="glass-nav fixed bottom-0 inset-x-0 z-50 flex min-h-topnav items-stretch justify-around"
        style={{ paddingBottom: "calc(var(--spacing-s) + env(safe-area-inset-bottom, 0px))" }}
      >
        {tabs.map(({ href, label, Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={label}
              href={href}
              className={[
                "tap-target flex flex-col items-center gap-xs py-s",
                "transition-[color,border-color] duration-[200ms]",
                "font-mono text-[11px] uppercase tracking-[0.18em]",
                active
                  ? "text-brand font-semibold border-b-2 border-brand"
                  : "text-muted-foreground",
              ].join(" ")}
            >
              <Icon className="h-5 w-5" aria-hidden />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
