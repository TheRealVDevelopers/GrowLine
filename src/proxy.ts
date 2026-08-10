import { NextResponse, type NextRequest } from "next/server";

// Cheap cookie-presence gate only. Real JWT verification lives in the
// authenticated layout and every API route (Next 16 auth-near-routes pattern).
const SESSION_COOKIE = "gl_session";
// /c/<code> is the prospect's self-fill form and /r/<token> is their wellness
// snapshot — both are opened by people with no account (F2 Mode B, F3/F4).
// `/demo` is public because it is reached BEFORE there is a session — it is the thing
// that creates one. It exists at all only when DEMO_MODE is set; the page itself calls
// notFound() otherwise, so listing it here does not open anything in production.
const PUBLIC_PATHS = [
  /^\/login$/,
  /^\/join(\/|$)/,
  /^\/c(\/|$)/,
  /^\/r(\/|$)/,
  /^\/demo$/,
];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = request.cookies.has(SESSION_COOKIE);
  const isPublic = PUBLIC_PATHS.some((re) => re.test(pathname));

  // Note: the snapshot HTML keeps Next's own `no-cache, must-revalidate` — Next
  // sets Cache-Control on dynamic page responses itself and overrides both this
  // proxy and next.config headers. Revalidation is enforced, but the response is
  // not marked `private`. The card/preview/PDF routes DO carry `private, no-store`
  // because a Route Handler controls its own headers. See DECISIONS.md D17.
  if (!hasSession && !isPublic) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  /**
   * `/login` is NOT redirected away when a cookie is present, deliberately.
   *
   * It used to be, and that turned a dead-but-present cookie into a redirect
   * loop. This gate can only see that a cookie EXISTS — verifying it needs the
   * Admin SDK, which cannot run here — so "has cookie" and "is signed in" are
   * different questions, and a revoked or expired session answers yes to the
   * first and no to the second. The cycle was:
   *
   *   /            -> layout cannot verify -> /api/auth/logout
   *   /api/auth/logout -> clears the cookie -> /login
   *   /login       -> cookie still on THIS request -> /
   *
   * and round again. Sending a signed-in coach from /login to home was a
   * convenience; bouncing a signed-out one between three routes is a lockout.
   * The authenticated layout is the only thing that can actually decide, so it
   * is the only thing that decides.
   */
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
