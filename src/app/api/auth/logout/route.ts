import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/session";

export async function POST() {
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}

// GET clears broken sessions (stale cookie with an invalid/expired JWT would
// otherwise loop between the proxy redirect and the layout redirect).
export async function GET(req: Request) {
  await clearSessionCookie();
  return NextResponse.redirect(new URL("/login", req.url));
}
