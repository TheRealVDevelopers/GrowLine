"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Avatar } from "./Avatar";
import {
  HomeIcon,
  LogIcon,
  ProspectsIcon,
  SettingsIcon,
  TeamIcon,
  ThreadsIcon,
} from "./icons";

const TABS = [
  { href: "/", label: "Home", Icon: HomeIcon },
  { href: "/prospects", label: "Prospects", Icon: ProspectsIcon },
  { href: "/log", label: "Log", Icon: LogIcon },
  { href: "/team", label: "Team", Icon: TeamIcon },
  { href: "/threads", label: "Threads", Icon: ThreadsIcon },
];

function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`text-xl font-bold tracking-tight text-white ${className}`}>
      Grow<span className="text-gold">line</span>
    </span>
  );
}

export default function AppNav({
  userName,
  userPhotoUrl,
}: {
  userName: string;
  userPhotoUrl: string | null;
}) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <>
      {/* Mobile top bar */}
      <header className="fixed inset-x-0 top-0 z-20 flex h-14 items-center justify-between bg-navy px-4 md:hidden">
        <Link href="/" className="flex h-12 items-center">
          <Wordmark />
        </Link>
        <Link
          href="/settings"
          aria-label="Settings"
          className="flex h-12 w-12 items-center justify-center rounded-full text-white/80"
        >
          <SettingsIcon className="h-6 w-6" />
        </Link>
      </header>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-20 grid h-16 grid-cols-5 border-t border-navy/10 bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
        {TABS.map(({ href, label, Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex min-h-12 flex-col items-center justify-center gap-0.5 ${
                active ? "text-navy" : "text-navy/45"
              }`}
            >
              <Icon className={`h-6 w-6 ${active ? "text-gold" : ""}`} />
              <span className={`text-xs ${active ? "font-semibold" : ""}`}>{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Desktop side rail */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col bg-navy p-4 text-white md:flex">
        <Link href="/" className="flex h-12 items-center px-2">
          <Wordmark className="text-2xl" />
        </Link>
        <nav className="mt-6 flex flex-col gap-1">
          {TABS.map(({ href, label, Icon }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex h-12 items-center gap-3 rounded-xl px-3 ${
                  active
                    ? "bg-white/10 font-semibold text-gold"
                    : "text-white/75 hover:bg-white/5 hover:text-white"
                }`}
              >
                <Icon className="h-5 w-5" />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto flex flex-col gap-1">
          <Link
            href="/settings"
            className={`flex h-12 items-center gap-3 rounded-xl px-3 ${
              isActive("/settings")
                ? "bg-white/10 font-semibold text-gold"
                : "text-white/75 hover:bg-white/5 hover:text-white"
            }`}
          >
            <SettingsIcon className="h-5 w-5" />
            Settings
          </Link>
          <div className="flex items-center gap-3 rounded-xl px-3 py-2">
            <Avatar name={userName} photoUrl={userPhotoUrl} size={32} />
            <span className="truncate text-sm text-white/85">{userName}</span>
          </div>
        </div>
      </aside>
    </>
  );
}
