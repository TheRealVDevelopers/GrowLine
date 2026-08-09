import { NextResponse } from "next/server";
import { setSessionCookie, verifyPhoneToken } from "@/lib/session";
import { createUser, getUserByPhone, getUserById, getUserByReferralCode } from "@/lib/users";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);

  // The ID token replaces D2's short-lived signup JWT: same job — carrying a
  // verified phone through profile setup — but minted and signed by Firebase.
  const idToken = typeof body?.idToken === "string" ? body.idToken : "";
  const verified = idToken ? await verifyPhoneToken(idToken) : null;
  if (!verified) {
    return NextResponse.json(
      { error: "Your session expired. Please verify your number again." },
      { status: 401 }
    );
  }
  const { uid, phone } = verified;

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

  const upline = refInput ? await getUserByReferralCode(refInput) : null;
  if (refInput && !upline) {
    return NextResponse.json(
      { error: "That referral code doesn't match any coach. Check it or leave it empty." },
      { status: 400 }
    );
  }

  // Two guards, not one. The uid check catches a double submit of this form; the
  // phone check catches a number that already has an account under a different
  // uid — which is what a migrated user hitting signup instead of login looks like.
  if (await getUserById(uid)) {
    return NextResponse.json({ error: "This account already exists. Log in instead." }, { status: 409 });
  }
  if (await getUserByPhone(phone)) {
    return NextResponse.json(
      { error: "This number already has an account. Log in instead." },
      { status: 409 }
    );
  }

  await createUser({ uid, phone, name, city, photoUrl, upline });
  await setSessionCookie(idToken);
  return NextResponse.json({ ok: true });
}
