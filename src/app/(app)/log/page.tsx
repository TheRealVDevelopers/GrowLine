import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { getLogState } from "@/lib/daily-log-queries";
import { todayHeading } from "@/lib/dates";
import LogForm from "./LogForm";
import StreakFlame from "@/components/StreakFlame";

export default async function LogPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const state = await getLogState(user.id);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-text">
            Today&apos;s Work
          </h1>
          <p className="mt-1 text-text-dim">{todayHeading()}</p>
        </div>
        {state.streak > 0 && (
          <StreakFlame days={state.streak} live={state.hasLoggedToday} />
        )}
      </div>
      <LogForm
        dayKey={state.today}
        initial={state.values}
        alreadyLogged={state.hasLoggedToday}
        initialStreak={state.streak}
      />
    </div>
  );
}
