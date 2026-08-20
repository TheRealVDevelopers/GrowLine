import { createHmac } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";

/**
 * `/api/payments/*` in a browser with no session (Phase 9b).
 *
 * ## Why this file exists at all
 *
 * D68: the portfolio shipped fully typed with 24 green tests and was completely
 * unreachable, because `src/proxy.ts` sent every session-less request to `/login`.
 * Nothing in the unit suite could see it — only a real request from a signed-out
 * browser. The lesson written down that day was "any public surface needs a test that
 * visits it with no session", and `/api/payments/webhook` is the next public surface.
 *
 * It is also the worst one to get wrong. Razorpay has no Growline session and no way to
 * tell us it is being redirected: a webhook eaten by the proxy returns a 307 to /login,
 * Razorpay reads a non-2xx, retries for days, and gives up. The visible symptom is a
 * coach who paid and never became a Leader — days later, in production, with the money
 * already taken. No unit test can reach that; this can.
 *
 * ## What the door is made of
 *
 * The webhook is unauthenticated ON PURPOSE. What stands in for a session is an HMAC
 * over the RAW body, checked in constant time before anything is parsed. So "reachable"
 * and "open" are different properties and both are tested here: a request with no
 * signature must arrive at the route and be turned away by the route (400), not by the
 * proxy (307). Every other payments route has a session and must refuse a stranger.
 */

const PROJECT = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "growline-dev";
const AUTH_EMULATOR = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9099";

/**
 * The webhook secret, shared by this process and the server.
 *
 * `playwright.config.ts` loads `.env` into the test runner, and `next start` loads the
 * same file — so a local run picks it up from there. CI has no `.env` and sets it in
 * `.github/scripts/ci-integration.sh` instead. It is a throwaway string in both places,
 * never a real Razorpay key: the point is to prove the HMAC path, and any secret proves
 * it equally well.
 *
 * Deliberately NOT defaulted to a constant. A default would make the signed tests pass
 * against a server that has no secret at all — which is the exact failure they exist to
 * catch — so when it is missing they skip loudly instead.
 */
const SECRET = process.env.RAZORPAY_WEBHOOK_SECRET ?? "";

const sign = (raw: string) => createHmac("sha256", SECRET).update(raw).digest("hex");

/** A Razorpay subscription event, shaped as the real payload is. */
function event(name: string, subId: string) {
  return JSON.stringify({
    event: name,
    payload: {
      subscription: {
        entity: {
          id: subId,
          status: name === "subscription.cancelled" ? "cancelled" : "active",
          current_end: Math.floor(Date.now() / 1000) + 30 * 86_400,
          notes: {},
        },
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Signed out. `request` is a bare API context — no cookies, no page, no session.
// ---------------------------------------------------------------------------

test("the webhook is REACHABLE with no session, and refuses an unsigned body", async ({
  request,
}) => {
  const res = await request.post("/api/payments/webhook", {
    data: { event: "subscription.activated" },
  });

  // 400 from the route. A 307 here is the D68 bug returning: the proxy would be
  // redirecting Razorpay to /login and no coach would ever be upgraded.
  expect(res.status(), "must be the route answering, not a redirect to /login").toBe(400);
  expect((await res.json()) as { error: string }).toMatchObject({ error: /signature/i });
});

test("a wrong signature is refused too", async ({ request }) => {
  const raw = event("subscription.activated", "sub_wrong_sig");
  const res = await request.post("/api/payments/webhook", {
    headers: {
      "Content-Type": "application/json",
      "x-razorpay-signature": "f".repeat(64),
      "x-razorpay-event-id": `evt_wrong_${Date.now()}`,
    },
    data: raw,
  });
  expect(res.status()).toBe(400);
});

/**
 * The manifest and its icons, fetched with no session — which is the only way a browser
 * ever fetches them.
 *
 * Same D68 lesson as the webhook above, with a quieter failure. A manifest redirected to
 * /login returns HTML with a 200, Chrome parses it, finds no name and no icons, and
 * simply does not offer installation. There is no error anywhere: the install button is
 * absent, and absent looks identical to "this browser doesn't support it".
 */
test("the manifest and its icons are reachable with no session", async ({ request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"] ?? "").toMatch(/manifest\+json|application\/json/);

  // Parsed, not just fetched: HTML from a /login redirect would still be a 200.
  const m = (await res.json()) as {
    name?: string;
    start_url?: string;
    display?: string;
    icons?: { src: string; sizes: string; purpose?: string }[];
  };
  expect(m.name).toBeTruthy();
  expect(m.start_url).toBe("/");
  expect(m.display).toBe("standalone");
  expect(m.icons?.length ?? 0).toBeGreaterThanOrEqual(4);

  // Every icon it promises must be served, signed out, as an image. A 404 here is an
  // install that fails with no message.
  for (const icon of m.icons ?? []) {
    const img = await request.get(icon.src);
    expect(img.status(), `${icon.src} must be reachable`).toBe(200);
    expect(img.headers()["content-type"] ?? "").toMatch(/image\/png/);
  }
});

test("every page carries the manifest link, so the browser can find it", async ({ page }) => {
  // The metadata route emits the tag; this asserts it actually reaches the login page,
  // which is the first page an about-to-install coach ever sees.
  await page.goto("/login");
  const href = await page.locator('link[rel="manifest"]').first().getAttribute("href");
  expect(href).toBeTruthy();
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
});

/**
 * The privacy notice, fetched with no session — which is how a prospect reaches it.
 *
 * It is linked from the QR capture form and from every wellness report, i.e. from the two
 * places used exclusively by people who will never have an account. "privacy" is a
 * RESERVED_SLUG so the portfolio matcher correctly refuses it, which means that without
 * an entry in PUBLIC_PATHS the proxy would send it to /login — a legal notice that
 * renders perfectly and cannot be read by anyone it was written for. That is D68 with a
 * regulator attached.
 *
 * Both states are asserted, because both are correct depending on configuration.
 */
test("the privacy notice is either published publicly or absent — never behind /login", async ({
  request,
}) => {
  const res = await request.get("/privacy", { maxRedirects: 0 });

  // 307 to /login is the failure this test exists for.
  expect(res.status(), "a legal notice must never redirect to login").not.toBe(307);
  expect([200, 404]).toContain(res.status());

  if (res.status() === 200) {
    // Published: it must actually carry the four facts and the disclaimers.
    const html = await res.text();
    expect(html).toMatch(/grievance/i);
    expect(html).toMatch(/not medical advice/i);
  } else {
    // Absent: the gate held because the grievance details are not configured, which is
    // the state of this repository and of CI.
    expect(res.status()).toBe(404);
  }
});

test("every other payments route refuses a stranger", async ({ request }) => {
  for (const path of [
    "/api/payments/subscribe",
    "/api/payments/cancel",
    "/api/payments/confirm",
  ]) {
    const res = await request.post(path, { data: { plan: "annual" } });
    // 401 from the route itself. These are not public surfaces and must say so
    // themselves rather than relying on the proxy, which does not cover /api.
    expect(res.status(), `${path} must refuse a session-less caller`).toBe(401);
  }
});

// ---------------------------------------------------------------------------
// Signed bodies. Need the secret in BOTH processes; skipped, loudly, without it.
// ---------------------------------------------------------------------------

test.describe("with a correctly signed body", () => {
  test.skip(
    () => !process.env.RAZORPAY_WEBHOOK_SECRET,
    "RAZORPAY_WEBHOOK_SECRET is unset — set it in .env (any throwaway string) to run these"
  );

  test("a signed event Growline does not handle is acknowledged, not retried", async ({
    request,
  }) => {
    const raw = event("payment.captured", `sub_ignored_${Date.now()}`);
    const res = await request.post("/api/payments/webhook", {
      headers: {
        "Content-Type": "application/json",
        "x-razorpay-signature": sign(raw),
        "x-razorpay-event-id": `evt_ignored_${Date.now()}`,
      },
      data: raw,
    });

    // 200, because Razorpay retries anything that is not 2xx and resending a
    // payment.* event will never make it one we act on.
    expect(res.status()).toBe(200);
    expect((await res.json()) as { ignored: string }).toMatchObject({
      ok: true,
      ignored: "payment.captured",
    });
  });

  test("a signed event for an unknown subscription is acknowledged, and changes nothing", async ({
    request,
  }) => {
    const subId = `sub_nobody_${Date.now()}`;
    const raw = event("subscription.activated", subId);
    const res = await request.post("/api/payments/webhook", {
      headers: {
        "Content-Type": "application/json",
        "x-razorpay-signature": sign(raw),
        "x-razorpay-event-id": `evt_nobody_${Date.now()}`,
      },
      data: raw,
    });

    // This is the whole path — signature, parse, Firestore lookup — and it ends in a
    // refusal to invent a coach. `applied: false` is the assertion that matters: a
    // subscription belonging to nobody must never grant anybody a tier.
    expect(res.status()).toBe(200);
    expect((await res.json()) as { applied: boolean; reason: string }).toMatchObject({
      applied: false,
      reason: /no coach/i,
    });
  });

  test("the same event id twice is applied once — idempotency is structural", async ({
    request,
  }) => {
    const eventId = `evt_twice_${Date.now()}`;
    const raw = event("subscription.activated", `sub_twice_${Date.now()}`);
    const headers = {
      "Content-Type": "application/json",
      "x-razorpay-signature": sign(raw),
      "x-razorpay-event-id": eventId,
    };

    const first = await request.post("/api/payments/webhook", { headers, data: raw });
    const second = await request.post("/api/payments/webhook", { headers, data: raw });

    expect(first.status()).toBe(200);
    expect(second.status()).toBe(200);
    // Razorpay redelivers; the guard is `webhookEvents/{id}` existing, written with
    // create() so a racing retry loses rather than double-applying.
    expect((await second.json()) as { reason: string }).toMatchObject({
      reason: /duplicate/i,
    });
  });
});

// ---------------------------------------------------------------------------
// Signed in, keys blank — the state this server is actually in before launch.
// ---------------------------------------------------------------------------

// Asha is a Starter with one direct downline (the same fixture the tiers spec uses).
const ASHA = { phone: "9000000002", name: "Asha" };

async function login(page: Page, who: { phone: string; name: string }) {
  await page.goto("/login");
  await page.getByPlaceholder("98765 43210").fill(who.phone);
  await page.getByRole("button", { name: /get otp/i }).click();
  const codeField = page.getByPlaceholder("••••••");
  await expect(codeField).toBeVisible({ timeout: 20_000 });
  const res = await fetch(
    `http://${AUTH_EMULATOR}/emulator/v1/projects/${PROJECT}/verificationCodes`
  );
  const body = (await res.json()) as {
    verificationCodes: { phoneNumber: string; code: string }[];
  };
  const mine = body.verificationCodes.filter((c) => c.phoneNumber === `+91${who.phone}`);
  await codeField.fill(mine[mine.length - 1].code);
  await expect(
    page.getByRole("heading", { name: new RegExp(`hello, ${who.name}`, "i") })
  ).toBeVisible({ timeout: 20_000 });
}

test("subscribing with no Razorpay keys says payments are off — it does not crash", async ({
  page,
}) => {
  await login(page, ASHA);

  // Called from inside the page so the Secure session cookie travels (see the note in
  // e2e/tiers.spec.ts — page.request will not send it over plain http).
  const res = await page.evaluate(async () => {
    const r = await fetch("/api/payments/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: "annual" }),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  });

  // 503 and a sentence, not a stack trace. A coach tapping a live-looking button on a
  // server with no keys must be told nothing was charged.
  expect(res.status).toBe(503);
  expect((res.body as { error: string }).error).toMatch(/not switched on/i);
});

test("the plans screen offers nothing to buy while every Leader tool is free", async ({
  page,
}) => {
  await login(page, ASHA);
  await page.goto("/plans");

  // The gate: TIERS_ENFORCED is false, so "Get Leader" must not be on the page. Selling
  // a tier whose tools are already open would be a dark pattern on a Trust Zone screen.
  await expect(page.getByText(/get leader/i)).toHaveCount(0);
  await expect(page.getByText(/no payment method is connected/i)).toBeVisible();
});
