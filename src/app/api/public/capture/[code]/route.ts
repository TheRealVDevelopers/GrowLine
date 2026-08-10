import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { prospects } from "@/lib/collections";
import { createProspect } from "@/lib/prospects";
import { getUserByReferralCode } from "@/lib/users";
import { parseProspectInput } from "@/lib/prospect";
import { ensureCurrentReport } from "@/lib/report";

// Unauthenticated endpoint (Mode B) — the prospect never installs anything, so
// abuse is bounded per coach rather than per session.
const MAX_PER_CODE_PER_HOUR = 40;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const coach = await getUserByReferralCode(code.toUpperCase());
  if (!coach) {
    return NextResponse.json(
      { error: "This link isn't valid. Please ask for a new one." },
      { status: 404 }
    );
  }

  const recent = (
    await prospects()
      .where("coachId", "==", coach.id)
      .where("source", "==", "qr")
      .where("createdAt", ">=", Timestamp.fromMillis(Date.now() - 60 * 60 * 1000))
      .count()
      .get()
  ).data().count;
  if (recent >= MAX_PER_CODE_PER_HOUR) {
    return NextResponse.json(
      { error: "Too many submissions right now. Please try again later." },
      { status: 429 }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = parseProspectInput(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { prospect } = await createProspect({
    coachId: coach.id,
    source: "qr",
    /**
     * Mode B consent is the act itself: this person scanned the code and typed their own
     * details, having read the notice on the form. Nobody is asserting it on their
     * behalf, which makes it the STRONGER of the two consents — Mode A records a coach's
     * word that a conversation happened; this records the person's own submission.
     */
    consentGiven: true,
    ...parsed.value,
  });
  // Generate the report now so it's waiting for the coach (F3). The token is
  // deliberately NOT returned — the prospect gets the link from the coach, so
  // that the coach stays the one who makes contact.
  await ensureCurrentReport(prospect);
  // Nothing about the coach or their other prospects is returned.
  return NextResponse.json({ ok: true });
}
