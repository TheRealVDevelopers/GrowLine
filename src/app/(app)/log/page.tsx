import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { getLogState } from "@/lib/daily-log-queries";
import { todayHeading } from "@/lib/dates";
import LogForm from "./LogForm";

export default async function LogPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const state = await getLogState(user.id);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">Today&apos;s Work</h1>
        <p className="mt-1 text-navy/70">{todayHeading()}</p>
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
