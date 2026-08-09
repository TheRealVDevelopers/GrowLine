import type { Metadata } from "next";
import { getUserByReferralCode } from "@/lib/users";
import { Avatar } from "@/components/Avatar";
import SelfCaptureForm from "./SelfCaptureForm";

export const metadata: Metadata = {
  title: "Get your free wellness report",
  // A prospect's details must never be indexed or crawled.
  robots: { index: false, follow: false },
};

export default async function PublicCapturePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const coach = await getUserByReferralCode(code.toUpperCase());

  if (!coach) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-10 text-center">
        <h1 className="text-2xl font-bold">This link isn&apos;t valid</h1>
        <p className="mt-2 text-navy/60">
          Please ask your coach to show you their QR code again.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 py-8">
      <div className="flex items-center gap-3">
        <Avatar name={coach.name} photoUrl={coach.photoUrl} size={52} />
        <div className="min-w-0">
          <p className="text-sm text-navy/60">Your wellness coach</p>
          <p className="truncate text-lg font-semibold">{coach.name}</p>
        </div>
      </div>

      <h1 className="mt-6 text-3xl font-bold leading-tight">
        Get your free wellness report
      </h1>
      <p className="mt-2 text-navy/60">
        Fill this in once — takes half a minute. {coach.name.split(" ")[0]} will send your
        report on WhatsApp.
      </p>

      <div className="mt-6">
        <SelfCaptureForm code={coach.referralCode} coachName={coach.name} />
      </div>
    </main>
  );
}
