import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { TIERS_ENFORCED, TIER_INFO, type Tier } from "@/modules/tiers/model";
import { getTierState } from "@/modules/tiers/queries";

/**
 * Plans (v2 §8) — a TRUST ZONE screen (RULES G1).
 *
 * Money-adjacent, so the calm register: flat surfaces, no glow, no animation, no
 * celebration, plain words. The only gold on this page is the border marking the
 * recommended card, which is emphasis, not fireworks.
 *
 * ## The honesty line
 *
 * While `TIERS_ENFORCED` is false, every Leader tool is open to everyone — so this
 * screen SAYS that, at the top, before any price. A pricing page that implies features
 * are locked while they are not would manufacture urgency out of nothing, which is
 * exactly the dark-pattern family G2 bans. When the flip happens, that banner comes
 * out and this comment with it.
 *
 * The UI favours annual, as §8 asks — the annual line leads and the monthly price is
 * the sub-line. Elite is shown and marked "coming soon": visible so the ladder reads
 * as a ladder, not buyable because selling an empty tier would be the same dark
 * pattern with a price tag.
 */
export default async function PlansPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const state = await getTierState(user);
  const order: Tier[] = ["starter", "leader", "elite"];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-display text-3xl font-bold text-text">Plans</h1>
        <p className="mt-1 text-text-dim">
          What Growline costs, with nothing hidden.
        </p>
      </div>

      {!TIERS_ENFORCED && (
        <p className="rounded-2xl bg-surface px-5 py-4 text-sm text-text/80">
          During launch, every tool is open to everyone — nothing is locked today.
          When payments begin, Leader tools stay with Leader
          {state.qualified
            ? ", and your free 30 days of Leader are reserved and start on that day."
            : ". Your 2nd coach joining your line earns you 30 days of Leader, free."}
        </p>
      )}

      {order.map((tier) => {
        const info = TIER_INFO[tier];
        const current = state.tier === tier;
        const recommended = tier === "leader";
        return (
          <section
            key={tier}
            className={`flex flex-col gap-3 rounded-2xl p-5 ${
              recommended ? "border border-gold bg-surface" : "bg-surface"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{info.name}</h2>
                <p className="text-2xl font-bold tabular-nums">{info.priceLine}</p>
                {info.subLine && (
                  <p className="text-sm text-text-dim">{info.subLine}</p>
                )}
              </div>
              {current && (
                <span className="shrink-0 rounded-full bg-elevated px-3 py-1 text-xs font-semibold text-text-dim">
                  Your plan
                </span>
              )}
            </div>
            <ul className="flex flex-col gap-1.5 text-sm text-text/80">
              {info.features.map((f) => (
                <li key={f} className="flex gap-2">
                  <span aria-hidden="true" className="text-text-dim">
                    •
                  </span>
                  {f}
                </li>
              ))}
            </ul>
            {!info.available && (
              <p className="text-sm text-text-dim">Not available yet.</p>
            )}
          </section>
        );
      })}

      <p className="text-sm text-text-dim">
        No payment method is connected to Growline today. When payments begin they run
        on UPI autopay, you see every charge before it happens, and cancelling takes
        two taps — your data stays yours on any plan.
      </p>
    </div>
  );
}
