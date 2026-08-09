import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateReferralCode } from "@/lib/referral";
import { setSessionCookie, verifySignupToken } from "@/lib/session";

const TRIAL_DAYS = 60;

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const phone = body?.signupToken
    ? await verifySignupToken(String(body.signupToken))
    : null;
  if (!phone) {
    return NextResponse.json(
      { error: "Your session expired. Please verify your number again." },
      { status: 401 }
    );
  }

  const name = String(body?.name ?? "").trim();
  const city = String(body?.city ?? "").trim();
  const rawPhoto = typeof body?.photoUrl === "string" ? body.photoUrl : "";
  const photoUrl =
    rawPhoto.startsWith("data:image/") && rawPhoto.length < 200_000 ? rawPhoto : null;
  const refInput = String(body?.referralCode ?? "").trim().toUpperCase();

  if (name.length < 2 || name.length > 60) {
    return NextResponse.json({ error: "Please enter your name." }, { status: 400 });
  }
  if (city.length < 2 || city.length > 60) {
    return NextResponse.json({ error: "Please enter your city." }, { status: 400 });
  }

  let uplineId: string | null = null;
  if (refInput) {
    const upline = await prisma.user.findUnique({ where: { referralCode: refInput } });
    if (!upline) {
      return NextResponse.json(
        { error: "That referral code doesn't match any coach. Check it or leave it empty." },
        { status: 400 }
      );
    }
    uplineId = upline.id;
  }

  const existing = await prisma.user.findUnique({ where: { phone } });
  if (existing) {
    return NextResponse.json(
      { error: "This number already has an account. Log in instead." },
      { status: 409 }
    );
  }

  const user = await prisma.user.create({
    data: {
      phone,
      name,
      city,
      photoUrl,
      uplineId,
      referralCode: await generateReferralCode(),
      trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000),
    },
  });
  await setSessionCookie(user.id);
  return NextResponse.json({ ok: true });
}
