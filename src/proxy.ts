import { NextResponse, type NextRequest } from "next/server";

// Cheap cookie-presence gate only. Real JWT verification lives in the
// authenticated layout and every API route (Next 16 auth-near-routes pattern).
const SESSION_COOKIE = "gl_session";
// /c/<code> is the prospect's self-fill form and /r/<token> is their wellness
// snapshot — both are opened by people with no account (F2 Mode B, F3/F4).
const PUBLIC_PATHS = [/^\/login$/, /^\/join(\/|$)/, /^\/c(\/|$)/, /^\/r(\/|$)/];

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
  if (hasSession && pathname === "/login") {
    return NextResponse.redirect(new URL("/", request.url));
  }
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
