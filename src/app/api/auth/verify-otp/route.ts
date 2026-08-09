import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { normalizeIndianPhone } from "@/lib/phone";
import { verifyOtp } from "@/lib/otp";
import { createSignupToken, setSessionCookie } from "@/lib/session";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const phone = normalizeIndianPhone(String(body?.phone ?? ""));
  const code = String(body?.code ?? "").trim();
  if (!phone || !/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: "Enter the 6-digit code." }, { status: 400 });
  }
  const result = await verifyOtp(phone, code);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  const user = await prisma.user.findUnique({ where: { phone } });
  if (user) {
    await setSessionCookie(user.id);
    return NextResponse.json({ isNewUser: false });
  }
  const signupToken = await createSignupToken(phone);
  return NextResponse.json({ isNewUser: true, signupToken });
}
