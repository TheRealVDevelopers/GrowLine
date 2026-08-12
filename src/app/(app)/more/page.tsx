import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";

/**
 * "More" — the hub for screens that are not one of the five bottom-nav tabs.
 *
 * ## Why this page exists
 *
 * `AppNav` hardcodes a five-column grid. Adding a sixth tab is a layout change, not
 * a route registration, and that decision belongs to the owner — so the nav is left
 * exactly as it is and the new screens are reachable here and by URL. If a sixth tab
 * is ever approved, it points at this page and nothing else has to move.
 *
 * Entries are added as each module lands. One line each, in plain words (S6) — a hub
 * whose descriptions need reading twice is a hub nobody uses.
 */

const LINKS = [
  {
    href: "/leaderboards",
    title: "Boards",
    body: "Four boards — volume, people met, follow-ups and your logging streak. Weekly and monthly.",
  },
  {
    href: "/qualifications",
    title: "Qualifications",
    body: "Conditions and a closing date. Track what is left, see who is already in, and set one for your own line.",
  },
];

export default async function MorePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-3xl font-bold text-text">More</h1>
        <p className="mt-1 text-text-dim">Everything that is not on the bottom bar.</p>
      </div>

      <ul className="flex flex-col gap-3">
        {LINKS.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              className="block rounded-2xl bg-surface p-5 transition-transform duration-150 active:translate-y-px"
            >
              <span className="font-display text-xl font-bold">{l.title}</span>
              <span className="mt-1 block text-sm text-text-dim">{l.body}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
