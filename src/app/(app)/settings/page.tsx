import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { formatPhoneForDisplay } from "@/lib/phone";
import { daysUntil, formatLongDate } from "@/lib/dates";
import ProfileSection from "./ProfileSection";
import ReminderToggle from "./ReminderToggle";
import PrivacyToggle from "./PrivacyToggle";
import LogoutButton from "./LogoutButton";
import ThemeToggle from "@/components/ThemeToggle";
import { getTranslate } from "@/lib/locale-server";
import LanguageSwitcher from "./LanguageSwitcher";

export default async function SettingsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const trialDaysLeft = daysUntil(user.trialEndsAt);
  const trialEndDate = formatLongDate(user.trialEndsAt);
  const { locale, t } = await getTranslate();

  return (
    <div className="flex flex-col gap-5">
      <ThemeToggle />

      <LanguageSwitcher
        current={locale}
        title={t("settings.language.title")}
        help={t("settings.language.help")}
        savingLabel={t("settings.language.saving")}
        errorLabel={t("settings.language.error")}
        reportNote={t("settings.language.reportNote")}
      />
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
            <p className="mt-1 text-sm text-text-dim">
              Free trial ends on {trialEndDate}. After that, Growline is ₹999/month or
              ₹9,999/year (2 months free). No payment method is connected yet — payment
              setup arrives before your trial ends, and you can cancel anytime.
            </p>
          </>
        ) : (
          <p className="mt-2 text-text-dim">Plan: {user.plan}</p>
        )}
      </section>

      <ReminderToggle />

      {/* F11. Above the referral code on purpose — the coach should meet the
          control that decides what their upline sees before the one that invites
          people into their line. */}
      <PrivacyToggle sharing={user.shareProspects} hasUpline={user.uplineId !== null} />

      <section className="rounded-2xl bg-surface p-5">
        <h2 className="font-semibold">My referral code</h2>
        <p className="mt-1 text-2xl font-bold tracking-[0.25em] text-gold-ink">
          {user.referralCode}
        </p>
      </section>

      <LogoutButton />

      <p className="text-center text-xs text-text-dim">
        Growline · Built by The Real V Developers, Bengaluru
      </p>
    </div>
  );
}
