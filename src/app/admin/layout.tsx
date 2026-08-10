import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/session";
import { adminEnabled, isAdmin } from "@/lib/admin";

/**
 * The admin gate (F12). Every admin screen is behind this layout, so the check cannot be
 * forgotten on a new page — the failure mode of putting it in each page instead.
 *
 * **404, not 403**, for a coach who is signed in but not an admin: a 403 confirms the
 * panel exists and tells them there is something to try. Same reasoning as the demo gate.
 *
 * Desktop-first and deliberately plain. F12 calls this internal tooling, not a product —
 * simple tables, no design system flourishes, nothing to maintain when the app is
 * restyled.
 */
export const dynamic = "force-dynamic";

const TABS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/coaches", label: "Coaches" },
  { href: "/admin/subscriptions", label: "Subscriptions" },
  { href: "/admin/promo", label: "Promo codes" },
  { href: "/admin/broadcast", label: "Broadcast" },
  { href: "/admin/audit", label: "Audit log" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // No allowlist configured means no panel in this deployment at all.
  if (!adminEnabled()) notFound();

  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!isAdmin(user.id)) notFound();

  return (
    <div className="min-h-dvh bg-bg text-text">
      <header className="border-b border-hairline px-6 py-4">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2">
          <span className="font-semibold">Growline admin</span>
          <nav className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {TABS.map((tab) => (
              <Link key={tab.href} href={tab.href} className="text-text-dim hover:text-text">
                {tab.label}
              </Link>
            ))}
          </nav>
          <span className="ml-auto text-sm text-text-dim">{user.name}</span>
          <Link href="/" className="text-sm text-text-dim hover:text-text">
            ← Back to the app
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>

      <footer className="mx-auto max-w-6xl px-6 pb-10 text-sm text-text-dim">
        {/* Stated on every screen, because it is the constraint most likely to be argued
            with during a support request. */}
        This panel shows counts only. Prospect names and phone numbers are never visible
        here — they belong to the coach who captured them.
      </footer>
    </div>
  );
}
