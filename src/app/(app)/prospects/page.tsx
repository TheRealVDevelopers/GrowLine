import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { bucketFollowup, describeFollowup } from "@/lib/followup";
import ProspectList, { type ProspectRow } from "./ProspectList";

export default async function ProspectsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const rows = await prisma.prospect.findMany({
    where: { coachId: user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      phone: true,
      age: true,
      gender: true,
      heightCm: true,
      weightKg: true,
      stage: true,
      source: true,
      createdAt: true,
      nextFollowupAt: true,
    },
  });

  const prospects: ProspectRow[] = rows.map((p) => ({
    ...p,
    createdAt: p.createdAt.toISOString(),
    nextFollowupAt: p.nextFollowupAt ? p.nextFollowupAt.toISOString() : null,
    // Bucketed and labelled on the server so every row agrees on what "today" is
    // rather than each browser deciding from its own clock.
    followupBucket: bucketFollowup(p.nextFollowupAt),
    followupLabel: describeFollowup(p.nextFollowupAt),
  }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Prospects</h1>
        <Link
          href="/prospects/qr"
          className="flex h-12 items-center rounded-xl border border-navy/20 px-4 font-medium"
        >
          My QR code
        </Link>
      </div>
      <ProspectList prospects={prospects} referralCode={user.referralCode} />
    </div>
  );
}
