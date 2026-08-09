import type { Metadata } from "next";
import { getSessionUserId } from "@/lib/session";
import { loadReportForRender } from "@/lib/report-render";
import {
  COACH_ROLE,
  DISCLAIMER,
  NOT_A_DOCTOR,
  REPORT_TITLE,
  nextStepLine,
} from "@/lib/report-copy";
import { whatsappNumber } from "@/lib/prospect";
import { Avatar } from "@/components/Avatar";
import SnapshotMetrics from "@/components/SnapshotMetrics";
import RemoveMyDetails from "./RemoveMyDetails";

type Params = { params: Promise<{ token: string }> };

// loadReportForRender is request-cached, so generateMetadata and the page below
// share one query — and both stay on the same token/expiry rules as the PNG,
// preview and PDF routes, which is the whole point of the shared loader.

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { token } = await params;
  const report = await loadReportForRender(token);
  return {
    title: report ? REPORT_TITLE : "Link not available",
    // The description is the first thing read in a WhatsApp preview, so the
    // disclaimer rides along with it — and no metric ever appears here.
    description: report
      ? `A wellness snapshot from ${report.coach.name}. ${DISCLAIMER}`
      : DISCLAIMER,
    robots: { index: false, follow: false },
    openGraph: report
      ? {
          title: REPORT_TITLE,
          description: `From ${report.coach.name}. ${DISCLAIMER}`,
          // Neutral branding, NOT the metrics card: a forwarded link renders its
          // preview inside whatever group chat it lands in.
          images: [{ url: `/r/${report.token}/preview.png`, width: 1200, height: 630 }],
        }
      : undefined,
  };
}

export default async function PublicReportPage({ params }: Params) {
  const { token } = await params;
  const report = await loadReportForRender(token);

  if (!report) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-10 text-center">
        <h1 className="text-2xl font-bold">This link is not available</h1>
        <p className="mt-2 text-navy/70">
          Wellness snapshot links stop working after a while. Ask your coach to send a
          fresh one.
        </p>
        <p className="mt-6 text-sm text-navy/70">{DISCLAIMER}</p>
      </main>
    );
  }

  const { coach, firstName } = report;
  const waLink = `https://wa.me/${whatsappNumber(coach.phone)}`;
  /**
   * Hidden only from the coach who OWNS this prospect — previewing their own send
   * shouldn't offer to delete it. Any other viewer keeps the control, because
   * prospects are often coaches themselves on this network, and a signed-in
   * Growline session is no reason to deny someone their own erasure link.
   */
  const viewerOwnsProspect = (await getSessionUserId()) === report.coachId;

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-8">
      <header className="flex flex-col gap-1">
        <p className="text-sm font-medium text-gold-600">Growline</p>
        <h1 className="text-3xl font-bold leading-tight">{REPORT_TITLE}</h1>
        <p className="text-navy/70">For {firstName}</p>
      </header>

      {/* Disclaimer above the fold, never behind a "read more" */}
      <p className="mt-5 rounded-2xl bg-navy-100 px-4 py-3 text-sm leading-snug text-navy">
        {DISCLAIMER} {NOT_A_DOCTOR}
      </p>

      <div className="mt-5">
        <SnapshotMetrics metrics={report.snapshot.metrics} />
      </div>

      <p className="mt-5 rounded-2xl bg-gold-100 px-5 py-4 text-base leading-snug text-navy">
        {nextStepLine(report.id)}
      </p>

      {/* Kept visually separate from the numbers, so the page never reads as
          "here is your problem, here is who to buy from". */}
      <section className="mt-8 border-t border-navy/10 pt-6">
        <div className="flex items-center gap-4">
          <Avatar name={coach.name} photoUrl={coach.photoUrl} size={56} />
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold">{coach.name}</p>
            <p className="truncate text-sm text-navy/70">
              {COACH_ROLE}
              {coach.city ? ` · ${coach.city}` : ""}
            </p>
          </div>
        </div>
        <a
          href={waLink}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-4 flex h-14 items-center justify-center rounded-xl bg-gold text-lg font-semibold text-navy"
        >
          Message {coach.name.split(" ")[0]} on WhatsApp
        </a>
      </section>

      <footer className="mt-8 flex flex-col gap-3 border-t border-navy/10 pt-6 text-sm text-navy/70">
        <p>{DISCLAIMER}</p>
        <p>{NOT_A_DOCTOR}</p>
        {!viewerOwnsProspect && <RemoveMyDetails token={report.token} />}
      </footer>
    </main>
  );
}
