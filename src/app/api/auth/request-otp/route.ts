import { NextResponse } from "next/server";
import { normalizeIndianPhone } from "@/lib/phone";
import { issueOtp } from "@/lib/otp";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const phone = normalizeIndianPhone(String(body?.phone ?? ""));
  if (!phone) {
    return NextResponse.json(
      { error: "Enter a valid 10-digit mobile number." },
      { status: 400 }
    );
  }
  const result = await issueOtp(phone);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 429 });
  }
  return NextResponse.json({ ok: true, phone, devCode: result.devCode ?? null });
}
