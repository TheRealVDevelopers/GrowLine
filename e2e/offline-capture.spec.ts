import { test, expect } from "@playwright/test";

/**
 * v1 §4.3 / RULES S5: prospect capture must work offline.
 *
 * This is the parity-gate item that assertions genuinely cannot reach. The
 * no-duplicate property is provable against the data layer (the composite
 * document id, D6/D35), but "does a capture survive a dead signal and sync when
 * it comes back" is a browser behaviour — IndexedDB, `navigator.onLine`, the
 * service worker, and OfflineSync draining from the authenticated layout (D9).
 *
 * Walk-and-talk happens where the network is weak, so this path failing silently
 * costs a coach the person they just met.
 */

const PROJECT = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "growline-dev";
const AUTH_EMULATOR = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9099";
const ASHA_PHONE = "9000000002";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByPlaceholder("98765 43210").fill(ASHA_PHONE);
  await page.getByRole("button", { name: /get otp/i }).click();
  const codeField = page.getByPlaceholder("••••••");
  await expect(codeField).toBeVisible({ timeout: 20_000 });

  const res = await fetch(
    `http://${AUTH_EMULATOR}/emulator/v1/projects/${PROJECT}/verificationCodes`
  );
  const body = (await res.json()) as {
    verificationCodes: { phoneNumber: string; code: string }[];
  };
  const mine = body.verificationCodes.filter((c) => c.phoneNumber === `+91${ASHA_PHONE}`);
  await codeField.fill(mine[mine.length - 1].code);
  await expect(page.getByRole("heading", { name: /hello, asha/i })).toBeVisible({
    timeout: 20_000,
  });
}

test("a capture made offline survives and syncs when the signal returns", async ({
  page,
  context,
}) => {
  await login(page);

  const name = `Offline Person ${Date.now()}`;
  await page.goto("/prospects/new");
  await expect(page.getByPlaceholder("Who did you meet?")).toBeVisible();

  // Signal dies mid-walk.
  await context.setOffline(true);

  await page.getByPlaceholder("Who did you meet?").fill(name);
  await page.getByPlaceholder("98765 43210").fill("9111100001");
  await page.getByRole("button", { name: /save person/i }).click();

  // The coach must be told it is safe, on the spot — not left staring at a
  // spinner that cannot resolve.
  await expect(page.getByText(/saved on this phone/i)).toBeVisible({ timeout: 15_000 });

  // Signal returns. OfflineSync drains from the authenticated layout, so any
  // screen will do — the coach does not have to open the prospect list (D9).
  await context.setOffline(false);
  await page.goto("/prospects");

  await expect(page.getByText(name)).toBeVisible({ timeout: 20_000 });

  // And the sync must not have produced two of them (D6).
  await expect(page.getByText(name)).toHaveCount(1);
});
