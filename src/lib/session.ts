import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { cache } from "react";
import { prisma } from "./db";

export const SESSION_COOKIE = "gl_session";
const SESSION_DAYS = 30;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET is not set");
  return new TextEncoder().encode(s);
}

export async function setSessionCookie(userId: string) {
  const token = await new SignJWT({ purpose: "session" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secret());
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function getSessionUserId(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload.purpose === "session" && typeof payload.sub === "string"
      ? payload.sub
      : null;
  } catch {
    return null;
  }
}

/** Per-request cached: layout + page can both call this with one DB hit. */
export const getSessionUser = cache(async () => {
  const uid = await getSessionUserId();
  if (!uid) return null;
  return prisma.user.findUnique({ where: { id: uid } });
});

/** Short-lived token proving OTP was verified, carried through profile setup. */
export async function createSignupToken(phone: string) {
  return new SignJWT({ purpose: "signup", phone })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("20m")
    .sign(secret());
}

export async function verifySignupToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload.purpose === "signup" && typeof payload.phone === "string"
      ? payload.phone
      : null;
  } catch {
    return null;
  }
}
