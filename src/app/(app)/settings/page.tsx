import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { formatPhoneForDisplay } from "@/lib/phone";
import { daysUntil, formatLongDate } from "@/lib/dates";
import ProfileSection from "./ProfileSection";
import ReminderToggle from "./ReminderToggle";
import LogoutButton from "./LogoutButton";
import ThemeToggle from "@/components/ThemeToggle";

export default async function SettingsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const trialDaysLeft = daysUntil(user.trialEndsAt);
  const trialEndDate = formatLongDate(user.trialEndsAt);

  return (
    <div className="flex flex-col gap-5">
      <ThemeToggle />
      <h1 className="text-2xl font-bold">Settings</h1>

      <ProfileSection
        name={user.name}
        city={user.city ?? ""}
        photoUrl={user.photoUrl}
        phoneDisplay={`+91 ${formatPhoneForDisplay(user.phone)}`}
      />

      {/* Trust-first: the trial countdown is always visible here (Section 4.7) */}
      <section className="rounded-2xl bg-surface p-5">
        <h2 className="font-semibold">My plan</h2>
        {user.plan === "trial" ? (
          <>
            <p className="mt-2 text-3xl font-bold">
              {trialDaysLeft} <span className="text-base font-medium">days left</span>
            </p>
            <p className="mt-1 text-sm text-navy/60">
              Free trial ends on {trialEndDate}. After that, Growline is ₹999/month or
              ₹9,999/year (2 months free). No payment method is connected yet — payment
              setup arrives before your trial ends, and you can cancel anytime.
            </p>
          </>
        ) : (
          <p className="mt-2 text-navy/70">Plan: {user.plan}</p>
        )}
      </section>

      <ReminderToggle />

      <section className="rounded-2xl bg-surface p-5">
        <h2 className="font-semibold">My referral code</h2>
        <p className="mt-1 text-2xl font-bold tracking-[0.25em] text-gold-600">
          {user.referralCode}
        </p>
      </section>

      <LogoutButton />

      <p className="text-center text-xs text-navy/40">
        Growline · Built by The Real V Developers, Bengaluru
      </p>
    </div>
  );
}
