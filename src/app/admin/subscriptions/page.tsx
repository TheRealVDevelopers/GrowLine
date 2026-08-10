import { users } from "@/lib/collections";

/**
 * Subscriptions (F12).
 *
 * Honest about its own emptiness. The tier model and Razorpay are unbuilt (v2.6), so every
 * coach carries the same placeholder plan and the conversion funnel has no stages to
 * measure. A page showing "0 paid, 0% conversion" would read as a business failing rather
 * than as a feature that does not exist — so it says which, in the same spirit as the
 * unmeasurable cards on the Overview.
 *
 * Plan counts are one `count()` per known plan rather than a scan: four aggregation
 * queries, no document reads, and it stays correct at any size.
 */
export const dynamic = "force-dynamic";

/** The values `users.plan` can hold today (v1 §11). v2.6 replaces these with tiers. */
const PLANS = ["trial", "monthly", "annual", "readonly"] as const;

export default async function AdminSubscriptionsPage() {
  const [total, ...counts] = await Promise.all([
    users().count().get(),
    ...PLANS.map((plan) => users().where("plan", "==", plan).count().get()),
  ]);

  const coaches = total.data().count;
  const byPlan = PLANS.map((plan, i) => ({ plan, count: counts[i].data().count }));
  const accountedFor = byPlan.reduce((sum, row) => sum + row.count, 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Subscriptions</h1>
        <p className="mt-1 text-text-dim">{coaches} coaches</p>
      </div>

      <div className="rounded-lg border border-dashed border-hairline p-5">
        <p className="font-semibold text-text-dim">
          Tiers and payments are not built yet
        </p>
        <p className="mt-2 text-sm text-text-dim">
          v2.6 replaces the placeholder <code>plan</code> field with Starter / Leader /
          Elite, adds the Razorpay mandate, and adds the trigger that offers a Leader trial
          when a coach&apos;s second downline joins. Until then there is no conversion
          funnel to show and nobody is paying — the numbers below are the placeholder field,
          not revenue.
        </p>
      </div>

      <section>
        <h2 className="font-semibold">Coaches by plan field</h2>
        <div className="mt-2 overflow-x-auto rounded-lg border border-hairline">
          <table className="w-full min-w-[24rem] text-sm">
            <thead className="border-b border-hairline text-left text-text-dim">
              <tr>
                <th className="px-4 py-3 font-medium">Plan</th>
                <th className="px-4 py-3 text-right font-medium">Coaches</th>
              </tr>
            </thead>
            <tbody>
              {byPlan.map((row) => (
                <tr key={row.plan} className="border-b border-hairline last:border-0">
                  <td className="px-4 py-3">{row.plan}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{row.count}</td>
                </tr>
              ))}
              {/* Surfaced rather than hidden: a mismatch means somebody's plan holds a
                  value this page does not know about, which is worth seeing. */}
              {accountedFor !== coaches && (
                <tr className="border-t border-hairline">
                  <td className="px-4 py-3 text-heat">Unrecognised plan value</td>
                  <td className="px-4 py-3 text-right tabular-nums text-heat">
                    {coaches - accountedFor}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
