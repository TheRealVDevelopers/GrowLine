import { cookies } from "next/headers";
import { cache } from "react";
import { auth } from "./firebase-admin";
import { getUserById, type AppUser } from "./users";

/**
 * Sessions, on Firebase Auth.
 *
 * Replaces the custom HS256 JWT from DECISIONS.md D2. The *shape* is unchanged
 * on purpose — one httpOnly cookie, a cheap presence check in `proxy.ts`, real
 * verification in the authenticated layout and every API route — so route
 * protection behaves exactly as it did and only the verification swaps.
 *
 * A Firebase ID token lives about an hour, which is useless for a coach who opens
 * the app twice a week. So the browser trades its ID token for a **session
 * cookie** (`createSessionCookie`), which Firebase issues for up to 14 days and
 * which can be checked against revocation server-side.
 *
 * ## Why signup tokens are gone
 *
 * D2 minted a 20-minute "signup" JWT to carry a verified phone through profile
 * setup. Firebase already issues exactly that artifact — an ID token proving this
 * person controls this number — so `verifyPhoneToken` replaces it.
 *
 * The session cookie is deliberately NOT set until the user document exists.
 * Otherwise a half-signed-up user would hold a valid session with no profile, and
 * the authenticated layout — which redirects to logout when `getSessionUser()`
 * returns null — would throw them straight back out of signup.
 */

export const SESSION_COOKIE = "gl_session";

// Firebase caps session cookies at 14 days. D2 used 30; this is the ceiling the
// platform allows, and the user re-verifies by SMS after it, which is the point.
const SESSION_MS = 14 * 24 * 60 * 60 * 1000;

export async function setSessionCookie(idToken: string) {
  const cookie = await auth.createSessionCookie(idToken, { expiresIn: SESSION_MS });
  const store = await cookies();
  store.set(SESSION_COOKIE, cookie, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MS / 1000,
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function getSessionUserId(): Promise<string | null> {
  const cookie = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!cookie) return null;
  try {
    // checkRevoked: a disabled or signed-out account stops working immediately
    // rather than at the end of a 14-day cookie.
    const decoded = await auth.verifySessionCookie(cookie, true);
    return decoded.uid;
  } catch {
    return null;
  }
}

/** Per-request cached: layout + page can both call this with one read. */
export const getSessionUser = cache(async (): Promise<AppUser | null> => {
  const uid = await getSessionUserId();
  if (!uid) return null;
  return getUserById(uid);
});

/**
 * Verifies a freshly-minted ID token from the phone-auth flow.
 *
 * Returns the uid and the verified phone number. The uid becomes the user
 * document id (D34), and the phone is trusted only because Firebase verified it —
 * never read from the request body.
 */
export async function verifyPhoneToken(
  idToken: string
): Promise<{ uid: string; phone: string } | null> {
  try {
    const decoded = await auth.verifyIdToken(idToken, true);
    const phone = decoded.phone_number;
    if (!phone) return null;
    return { uid: decoded.uid, phone };
  } catch {
    return null;
  }
}
